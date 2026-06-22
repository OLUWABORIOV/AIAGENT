# app/worker.py
import json
import logging
from datetime import datetime, timezone
from arq import ArqRedis
from arq.connections import RedisSettings
from app.agent import run_agent
from app.config import settings
from app.schemas import JobStatus

logger = logging.getLogger(__name__)

async def run_agent_job(
    ctx: dict,
    job_id: str,
    question: str,
    user_id: str,
    documents: list[str],
):
    
    #This function runs inside the arq worker process.
    #It updates job status in Redis throughout.
    
    redis: ArqRedis = ctx["redis"]

    async def set_status(status: JobStatus, **extra):
        await redis.set(
            f"job:{job_id}",
            json.dumps({"status": status, "job_id": job_id, **extra}),
            ex=settings.job_ttl_secs,
        )

    try:
        logger.info("job_start", extra={"job_id": job_id, "user_id": user_id})
        await set_status(JobStatus.RUNNING, started_at=datetime.now(timezone.utc).isoformat())

        # The actual agent call — runs synchronously inside the worker
        # (wrap in asyncio.to_thread if your agent is blocking)
        output = run_agent(question=question, documents=documents)

        await set_status(
            JobStatus.COMPLETED,
            answer=output.answer,
            input_tokens=output.input_tokens,
            output_tokens=output.output_tokens,
            cost_usd=round(output.cost_usd, 6),
            duration_secs=round(output.duration_secs, 2),
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        logger.info("job_complete", extra={"job_id": job_id, "cost_usd": output.cost_usd})

    except Exception as e:
        logger.exception("job_failed", extra={"job_id": job_id, "error": str(e)})
        await set_status(JobStatus.FAILED, error=str(e))
        raise

# ── Worker settings ───────────────────────────────────────────────────────────
class WorkerSettings:
    functions = [run_agent_job]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 5                          # concurrent jobs per worker process
    job_timeout = settings.job_timeout_secs
    keep_result = settings.job_ttl_secs
    on_startup = None
    on_shutdown = None