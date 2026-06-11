"""
test_api.py — Tests for every FastAPI endpoint.

TEACHING NOTE — Test organisation:
  Group tests by the thing they're testing (a class per endpoint).
  Each test should:
  1. Arrange — set up state (write to Redis, create a job, etc.)
  2. Act — make the HTTP request
  3. Assert — check the response

  Test names should be a SENTENCE describing what they verify:
  test_submit_job_returns_202_with_job_id
  Not: test_submit, test_1, test_post

TEACHING NOTE — What to test in API tests:
  ✅ Response status codes
  ✅ Response body shape and types
  ✅ Error cases (missing auth, invalid input, job not found)
  ✅ Side effects (was Redis written? was arq called?)
  ❌ Internal agent logic (that's test_agent.py's job)
  ❌ Real LLM calls (mock them)
"""

import json
import pytest
from httpx import AsyncClient

from app.schemas import JobStatus


# ── Health endpoint ───────────────────────────────────────────────────────────

class TestHealth:
    async def test_health_returns_200_when_redis_is_up(self, client: AsyncClient):
        response = await client.get("/health")
        assert response.status_code == 200

    async def test_health_response_has_expected_fields(self, client: AsyncClient):
        data = (await client.get("/health")).json()
        assert "status" in data
        assert "version" in data
        assert "redis" in data

    async def test_health_reports_redis_ok(self, client: AsyncClient):
        data = (await client.get("/health")).json()
        assert data["redis"] == "ok"
        assert data["status"] == "ok"


# ── Submit job ────────────────────────────────────────────────────────────────

class TestSubmitJob:
    async def test_returns_202_accepted(self, client: AsyncClient):
        response = await client.post("/v1/agent/run", json={
            "question": "What is 2 + 2?",
            "user_id": "user_001",
        })
        assert response.status_code == 202

    async def test_response_contains_job_id(self, client: AsyncClient):
        response = await client.post("/v1/agent/run", json={
            "question": "What is 2 + 2?",
            "user_id": "user_001",
        })
        data = response.json()
        assert "job_id" in data
        assert len(data["job_id"]) > 0

    async def test_response_contains_poll_url(self, client: AsyncClient):
        response = await client.post("/v1/agent/run", json={
            "question": "What is 2 + 2?",
            "user_id": "user_001",
        })
        data = response.json()
        assert "poll_url" in data
        assert data["job_id"] in data["poll_url"]

    async def test_initial_status_is_queued(self, client: AsyncClient):
        response = await client.post("/v1/agent/run", json={
            "question": "What is 2 + 2?",
            "user_id": "user_001",
        })
        assert response.json()["status"] == "queued"

    async def test_enqueues_job_in_arq(self, client: AsyncClient):
        from app.main import app
        await client.post("/v1/agent/run", json={
            "question": "What is 2 + 2?",
            "user_id": "user_001",
        })
        app.state.arq.enqueue_job.assert_called_once()
        call_kwargs = app.state.arq.enqueue_job.call_args.kwargs
        assert call_kwargs["question"] == "What is 2 + 2?"
        assert call_kwargs["user_id"] == "user_001"

    async def test_writes_queued_record_to_redis(self, client: AsyncClient, fake_redis):
        response = await client.post("/v1/agent/run", json={
            "question": "What is 2 + 2?",
            "user_id": "user_001",
        })
        job_id = response.json()["job_id"]
        raw = await fake_redis.get(f"job:{job_id}")
        assert raw is not None
        record = json.loads(raw)
        assert record["status"] == "queued"
        assert record["user_id"] == "user_001"

    async def test_rejects_empty_question(self, client: AsyncClient):
        response = await client.post("/v1/agent/run", json={
            "question": "",
            "user_id": "user_001",
        })
        assert response.status_code == 422  # Pydantic validation error

    async def test_rejects_missing_user_id(self, client: AsyncClient):
        response = await client.post("/v1/agent/run", json={
            "question": "What is 2 + 2?",
        })
        assert response.status_code == 422

    async def test_rejects_invalid_user_id_characters(self, client: AsyncClient):
        response = await client.post("/v1/agent/run", json={
            "question": "What is 2 + 2?",
            "user_id": "user; DROP TABLE users;--",   # SQL injection attempt
        })
        assert response.status_code == 422

    async def test_accepts_documents_list(self, client: AsyncClient):
        response = await client.post("/v1/agent/run", json={
            "question": "Summarise the documents",
            "user_id": "user_001",
            "documents": ["Doc 1 content", "Doc 2 content"],
        })
        assert response.status_code == 202

    async def test_increments_user_job_counter(self, client: AsyncClient, fake_redis):
        await client.post("/v1/agent/run", json={
            "question": "Test question",
            "user_id": "user_counter_test",
        })
        count = await fake_redis.get("user_jobs:user_counter_test")
        assert int(count) == 1

    async def test_rate_limit_rejects_when_at_max(self, client: AsyncClient, fake_redis, monkeypatch):
        from app import config
        monkeypatch.setattr(config.settings, "max_jobs_per_user", 1)

        # Fill up the limit
        await fake_redis.set("user_jobs:heavy_user", "1")
        await fake_redis.expire("user_jobs:heavy_user", 300)

        response = await client.post("/v1/agent/run", json={
            "question": "Another question",
            "user_id": "heavy_user",
        })
        assert response.status_code == 429
        assert "Max" in response.json()["detail"]


# ── Get job ───────────────────────────────────────────────────────────────────

class TestGetJob:
    async def test_returns_404_for_unknown_job_id(self, client: AsyncClient):
        response = await client.get("/v1/agent/jobs/nonexistent-id")
        assert response.status_code == 404

    async def test_returns_queued_status_for_new_job(self, client: AsyncClient, fake_redis):
        # Set up a queued job in Redis directly
        from app.schemas import JobRecord
        record = JobRecord(
            job_id="test-job-123",
            status=JobStatus.QUEUED,
            user_id="user_001",
            created_at="2026-04-01T00:00:00Z",
        )
        await fake_redis.set("job:test-job-123", record.model_dump_json(), ex=3600)

        response = await client.get("/v1/agent/jobs/test-job-123")
        assert response.status_code == 200
        assert response.json()["status"] == "queued"

    async def test_returns_completed_result_with_answer(self, client: AsyncClient, fake_redis):
        from app.schemas import JobRecord
        record = JobRecord(
            job_id="done-job",
            status=JobStatus.COMPLETED,
            user_id="user_001",
            created_at="2026-04-01T00:00:00Z",
            answer="Paris is the capital of France.",
            input_tokens=150,
            output_tokens=12,
            cost_usd=0.000630,
            duration_secs=1.24,
            steps_taken=1,
            completed_at="2026-04-01T00:00:02Z",
        )
        await fake_redis.set("job:done-job", record.model_dump_json(), ex=3600)

        response = await client.get("/v1/agent/jobs/done-job")
        data = response.json()

        assert response.status_code == 200
        assert data["status"] == "completed"
        assert data["answer"] == "Paris is the capital of France."
        assert data["cost_usd"] == 0.000630
        assert data["input_tokens"] == 150

    async def test_returns_failed_status_with_error(self, client: AsyncClient, fake_redis):
        from app.schemas import JobRecord
        record = JobRecord(
            job_id="failed-job",
            status=JobStatus.FAILED,
            user_id="user_001",
            created_at="2026-04-01T00:00:00Z",
            error="API rate limit exceeded",
        )
        await fake_redis.set("job:failed-job", record.model_dump_json(), ex=3600)

        response = await client.get("/v1/agent/jobs/failed-job")
        data = response.json()

        assert response.status_code == 200
        assert data["status"] == "failed"
        assert "rate limit" in data["error"]

    async def test_response_has_all_expected_fields(self, client: AsyncClient, fake_redis):
        from app.schemas import JobRecord
        record = JobRecord(
            job_id="full-job",
            status=JobStatus.COMPLETED,
            user_id="user_001",
            created_at="2026-04-01T00:00:00Z",
            answer="Done.",
        )
        await fake_redis.set("job:full-job", record.model_dump_json(), ex=3600)

        data = (await client.get("/v1/agent/jobs/full-job")).json()
        expected_fields = ["job_id", "status", "answer", "error", "input_tokens",
                           "output_tokens", "cost_usd", "duration_secs", "steps_taken",
                           "created_at"]
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"


# ── User jobs ─────────────────────────────────────────────────────────────────

class TestUserJobs:
    async def test_returns_zero_for_user_with_no_jobs(self, client: AsyncClient):
        response = await client.get("/v1/users/brand_new_user/jobs")
        assert response.status_code == 200
        assert response.json()["active_jobs"] == 0

    async def test_returns_correct_count(self, client: AsyncClient, fake_redis):
        await fake_redis.set("user_jobs:busy_user", "3")
        response = await client.get("/v1/users/busy_user/jobs")
        data = response.json()
        assert data["active_jobs"] == 3
        assert data["user_id"] == "busy_user"


# ── Cancel job ────────────────────────────────────────────────────────────────

class TestCancelJob:
    async def test_cancels_queued_job(self, client: AsyncClient, fake_redis):
        from app.schemas import JobRecord
        record = JobRecord(
            job_id="cancel-me",
            status=JobStatus.QUEUED,
            user_id="user_001",
            created_at="2026-04-01T00:00:00Z",
        )
        await fake_redis.set("job:cancel-me", record.model_dump_json(), ex=3600)

        response = await client.delete("/v1/agent/jobs/cancel-me")
        assert response.status_code == 200
        assert response.json()["status"] == "cancelled"

    async def test_cannot_cancel_completed_job(self, client: AsyncClient, fake_redis):
        from app.schemas import JobRecord
        record = JobRecord(
            job_id="already-done",
            status=JobStatus.COMPLETED,
            user_id="user_001",
            created_at="2026-04-01T00:00:00Z",
            answer="Done.",
        )
        await fake_redis.set("job:already-done", record.model_dump_json(), ex=3600)

        response = await client.delete("/v1/agent/jobs/already-done")
        assert response.status_code == 409   # Conflict

    async def test_cancel_returns_404_for_unknown_job(self, client: AsyncClient):
        response = await client.delete("/v1/agent/jobs/ghost-job")
        assert response.status_code == 404


# ── Auth ──────────────────────────────────────────────────────────────────────

class TestAuth:
    async def test_rejects_missing_api_key(self, client: AsyncClient, monkeypatch):
        from app import config
        monkeypatch.setattr(config.settings, "api_keys", ["valid-key"])

        # Client without any auth header
        from httpx import ASGITransport, AsyncClient as HxClient
        from app.main import app
        async with HxClient(transport=ASGITransport(app=app), base_url="http://test") as no_auth:
            response = await no_auth.post("/v1/agent/run", json={
                "question": "Test", "user_id": "user_001"
            })
        assert response.status_code == 401

    async def test_rejects_wrong_api_key(self, client: AsyncClient, monkeypatch):
        from app import config
        monkeypatch.setattr(config.settings, "api_keys", ["correct-key"])

        from httpx import ASGITransport, AsyncClient as HxClient
        from app.main import app
        async with HxClient(
            transport=ASGITransport(app=app), base_url="http://test",
            headers={"X-API-Key": "wrong-key"}
        ) as bad_client:
            response = await bad_client.post("/v1/agent/run", json={
                "question": "Test", "user_id": "user_001"
            })
        assert response.status_code == 401