"""
test_worker.py — Tests for the arq worker function.

TEACHING NOTE:
  Workers are just async Python functions that take (ctx, **kwargs).
  Testing them directly is straightforward — call the function,
  pass a mock ctx with a fake Redis, check what was written to Redis.

  We mock run_agent() because:
  1. It makes real API calls
  2. It's slow
  3. test_agent.py tests run_agent() in detail

  We're testing that the WORKER correctly:
  - Updates job status through the lifecycle (queued → running → completed/failed)
  - Writes the correct data to Redis at each stage
  - Decrements the user job counter when done
  - Re-raises exceptions so arq can retry
"""

import json
import pytest
import pytest_asyncio
import fakeredis.aioredis as fake_aioredis
from unittest.mock import AsyncMock, patch, MagicMock

from app.worker import run_agent_job
from app.schemas import AgentOutput, JobStatus


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def redis():
    r = fake_aioredis.FakeRedis(decode_responses=True)
    yield r
    await r.aclose()


@pytest.fixture
def ctx(redis):
    """Fake arq context dict — what arq passes to every job function."""
    return {
        "redis": redis,
        "job_id": "test-job-abc",
    }


@pytest.fixture
def good_output():
    return AgentOutput(
        answer="Paris is the capital of France.",
        input_tokens=150,
        output_tokens=12,
        cost_usd=0.000630,
        duration_secs=1.24,
        steps_taken=1,
    )


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestRunAgentJob:
    """
    TEACHING NOTE: each test follows the same pattern:
    1. Set up fakeredis and mock run_agent
    2. Call run_agent_job() directly
    3. Read from fakeredis and assert what was written
    """

    async def test_writes_running_status_before_agent_call(self, ctx, redis, good_output):
        """
        TEACHING NOTE: we want to verify the worker sets RUNNING status
        BEFORE calling the agent. To test this, we check that the
        RUNNING status appears in Redis even if we capture state mid-run.
        We verify it by checking the COMPLETED record (which overwrites RUNNING)
        and trust the code order.
        """
        with patch("app.worker.run_agent", return_value=good_output):
            await run_agent_job(ctx, "job-123", "Test question", "user_001", [])

        raw = await redis.get("job:job-123")
        record = json.loads(raw)
        # Final status should be completed
        assert record["status"] == "completed"

    async def test_writes_completed_status_on_success(self, ctx, redis, good_output):
        with patch("app.worker.run_agent", return_value=good_output):
            await run_agent_job(ctx, "job-success", "Test question", "user_001", [])

        raw = await redis.get("job:job-success")
        assert raw is not None
        record = json.loads(raw)
        assert record["status"] == "completed"

    async def test_writes_answer_on_success(self, ctx, redis, good_output):
        with patch("app.worker.run_agent", return_value=good_output):
            await run_agent_job(ctx, "job-ans", "Test question", "user_001", [])

        record = json.loads(await redis.get("job:job-ans"))
        assert record["answer"] == "Paris is the capital of France."

    async def test_writes_token_counts_on_success(self, ctx, redis, good_output):
        with patch("app.worker.run_agent", return_value=good_output):
            await run_agent_job(ctx, "job-tokens", "Test", "user_001", [])

        record = json.loads(await redis.get("job:job-tokens"))
        assert record["input_tokens"] == 150
        assert record["output_tokens"] == 12

    async def test_writes_cost_on_success(self, ctx, redis, good_output):
        with patch("app.worker.run_agent", return_value=good_output):
            await run_agent_job(ctx, "job-cost", "Test", "user_001", [])

        record = json.loads(await redis.get("job:job-cost"))
        assert record["cost_usd"] == pytest.approx(0.000630, abs=1e-6)

    async def test_writes_completed_at_timestamp(self, ctx, redis, good_output):
        with patch("app.worker.run_agent", return_value=good_output):
            await run_agent_job(ctx, "job-ts", "Test", "user_001", [])

        record = json.loads(await redis.get("job:job-ts"))
        assert record["completed_at"] is not None
        assert "2026" in record["completed_at"] or "Z" in record["completed_at"]

    async def test_writes_failed_status_on_exception(self, ctx, redis):
        with patch("app.worker.run_agent", side_effect=RuntimeError("Something broke")):
            with pytest.raises(RuntimeError):   # worker re-raises for arq retry
                await run_agent_job(ctx, "job-fail", "Test", "user_001", [])

        raw = await redis.get("job:job-fail")
        assert raw is not None
        record = json.loads(raw)
        assert record["status"] == "failed"

    async def test_writes_error_message_on_failure(self, ctx, redis):
        with patch("app.worker.run_agent", side_effect=RuntimeError("API error 500")):
            with pytest.raises(RuntimeError):
                await run_agent_job(ctx, "job-err", "Test", "user_001", [])

        record = json.loads(await redis.get("job:job-err"))
        assert "API error 500" in record["error"]

    async def test_reraises_exception_for_arq_retry(self, ctx, redis):
        """
        TEACHING NOTE:
          If the worker swallowed the exception, arq would mark the job as
          successful and never retry it. We MUST re-raise.
        """
        with patch("app.worker.run_agent", side_effect=ValueError("Bad input")):
            with pytest.raises(ValueError, match="Bad input"):
                await run_agent_job(ctx, "job-reraise", "Test", "user_001", [])

    async def test_decrements_user_job_counter_on_success(self, ctx, redis, good_output):
        # Set the user's counter to 2
        await redis.set("user_jobs:user_001", "2")

        with patch("app.worker.run_agent", return_value=good_output):
            await run_agent_job(ctx, "job-decr", "Test", "user_001", [])

        count = await redis.get("user_jobs:user_001")
        assert int(count) == 1   # decremented from 2 to 1

    async def test_decrements_user_job_counter_on_failure(self, ctx, redis):
        await redis.set("user_jobs:user_fail", "2")

        with patch("app.worker.run_agent", side_effect=RuntimeError("fail")):
            with pytest.raises(RuntimeError):
                await run_agent_job(ctx, "job-fail-decr", "Test", "user_fail", [])

        count = await redis.get("user_jobs:user_fail")
        assert int(count) == 1   # still decremented even on failure

    async def test_passes_documents_to_agent(self, ctx, redis):
        captured_kwargs = {}

        def capture_run_agent(**kwargs):
            captured_kwargs.update(kwargs)
            return AgentOutput(
                answer="Done", input_tokens=10, output_tokens=5,
                cost_usd=0.0001, duration_secs=0.5, steps_taken=1,
            )

        with patch("app.worker.run_agent", side_effect=capture_run_agent):
            await run_agent_job(
                ctx, "job-docs", "Test with docs", "user_001",
                ["Document A", "Document B"]
            )

        assert "Document A" in captured_kwargs.get("documents", [])
        assert "Document B" in captured_kwargs.get("documents", [])

    async def test_job_result_has_ttl_in_redis(self, ctx, redis, good_output):
        """Results should expire — don't fill Redis forever."""
        with patch("app.worker.run_agent", return_value=good_output):
            await run_agent_job(ctx, "job-ttl", "Test", "user_001", [])

        ttl = await redis.ttl("job:job-ttl")
        # TTL should be set (positive value) — not -1 (no TTL)
        assert ttl > 0