# app/worker.py
import json
import logging
from datetime import datetime, timezone
from arq import ArqRedis
from arq.connections import RedisSettings
from app.agent import run_agent
from app.config import settings
from app.schemas import JobStatus
import asyncio

logger = logging.getLogger(__name__)
async def _release_user_slot(redis, user_id: str):
    key = f"user_jobs:{user_id}"
    remaining = await redis.decr(key)
    if remaining < 0:
        await redis.set(key, 0)
async def run_agent_job(
    ctx: dict,
    job_id: str,
    question: str,
    user_id: str,
    documents: list[str],
):
    # Runs inside the arq worker process.
    # Updates job status in Redis throughout.
    redis: ArqRedis = ctx["redis"]

    async def set_status(status: JobStatus, **extra):
        raw = await redis.get(f"job:{job_id}")
        record = json.loads(raw) if raw else {}
        record.update({"status": status, "job_id": job_id, **extra})
        await redis.set(
            f"job:{job_id}",
            json.dumps(record),
            ex=settings.job_ttl_secs,
        )

    try:
        logger.info("job_start", extra={"job_id": job_id, "user_id": user_id})
        await set_status(JobStatus.RUNNING, started_at=datetime.now(timezone.utc).isoformat())

        output = await asyncio.to_thread(run_agent, question=question, documents=documents)

        total_tokens = output.input_tokens + output.output_tokens
        if total_tokens > settings.max_tokens_per_job:
            raise RuntimeError(
                f"Job exceeded token budget: {total_tokens} > {settings.max_tokens_per_job}"
            )
        if output.cost_usd > settings.max_cost_usd_per_job:
            raise RuntimeError(
                f"Job exceeded cost cap: ${output.cost_usd:.6f} > ${settings.max_cost_usd_per_job:.2f}"
            )

        await set_status(
            JobStatus.COMPLETED,
            answer=output.answer,
            input_tokens=output.input_tokens,
            output_tokens=output.output_tokens,
            cost_usd=round(output.cost_usd, 6),
            duration_secs=round(output.duration_secs, 2),
            steps_taken=output.steps_taken,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        logger.info("job_complete", extra={"job_id": job_id, "cost_usd": output.cost_usd})

    except Exception as e:
        logger.exception("job_failed", extra={"job_id": job_id, "error": str(e)})
        await set_status(JobStatus.FAILED, error=str(e))
        raise
    finally:
        await _release_user_slot(redis, user_id)

# ── Worker settings ───────────────────────────────────────────────────────────
class WorkerSettings:
    functions = [run_agent_job]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 5                          # concurrent jobs per worker process
    job_timeout = settings.job_timeout_secs
    keep_result = settings.job_ttl_secs
    on_startup = None
    on_shutdown = None
