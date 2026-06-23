# app/main.py
import json
import uuid
import logging
from datetime import datetime, timezone
from contextlib import asynccontextmanager
#API IMPORT
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.security import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware
import redis.asyncio as aioredis
from arq import create_pool
from arq.connections import RedisSettings

from app.config import settings
from app.schemas import AgentRequest, JobResponse, JobResult, JobStatus

logger = logging.getLogger(__name__)

# ── Lifespan: connect Redis pool on startup ───────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.redis = await aioredis.from_url(settings.redis_url, decode_responses=True)
    app.state.arq   = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    logger.info("Redis connected")
    yield
    await app.state.redis.close()
    await app.state.arq.close()

# ── App python hello.py
app = FastAPI(
    title=settings.api_title,
    version=settings.api_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Auth ──────────────────────────────────────────────────────────────────────
api_key_header = APIKeyHeader(name=settings.api_key_header, auto_error=False)

async def require_api_key(key: str = Depends(api_key_header)):
    if not settings.api_keys or key not in settings.api_keys:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return key

# ── Rate limit: max concurrent jobs per user ──────────────────────────────────
async def check_user_job_limit(user_id: str, redis: aioredis.Redis):
    count = await redis.get(f"user_jobs:{user_id}")
    if count and int(count) >= settings.max_jobs_per_user:
        raise HTTPException(
            status_code=429,
            detail=f"Max {settings.max_jobs_per_user} concurrent jobs per user",
        )
    await redis.incr(f"user_jobs:{user_id}")
    await redis.expire(f"user_jobs:{user_id}", settings.job_timeout_secs)

async def decrement_user_jobs(user_id: str, redis: aioredis.Redis):
    count = await redis.get(f"user_jobs:{user_id}")
    if count and int(count) > 0:
        await redis.decr(f"user_jobs:{user_id}")

# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "version": settings.api_version}

@app.post("/v1/agent/run", response_model=JobResponse, status_code=202)
async def submit_job(
    request: Request,
    body: AgentRequest,
    _key: str = Depends(require_api_key),
):
    redis = request.app.state.redis
    arq   = request.app.state.arq

    await check_user_job_limit(body.user_id, redis)

    job_id = str(uuid.uuid4())
    now    = datetime.now(timezone.utc)

    # Store initial state
    await redis.set(
        f"job:{job_id}",
        json.dumps({
            "job_id": job_id,
            "status": JobStatus.QUEUED,
            "created_at": now.isoformat(),
            "user_id": body.user_id,
        }),
        ex=settings.job_ttl_secs,
    )

    # Enqueue the job
    await arq.enqueue_job(
        "run_agent_job",
        job_id=job_id,
        question=body.question,
        user_id=body.user_id,
        documents=body.documents,
        _job_id=job_id,
        _job_try=1,
    )

    logger.info("job_queued", extra={"job_id": job_id, "user_id": body.user_id})

    return JobResponse(
        job_id=job_id,
        status=JobStatus.QUEUED,
        created_at=now,
        poll_url=f"/v1/agent/jobs/{job_id}",
    )

@app.get("/v1/agent/jobs/{job_id}", response_model=JobResult)
async def get_job(job_id: str, request: Request, _key: str = Depends(require_api_key)):
    redis = request.app.state.redis
    data  = await redis.get(f"job:{job_id}")

    if not data:
        raise HTTPException(status_code=404, detail="Job not found or expired")

    job = json.loads(data)

    # Decrement counter when job finishes
    if job["status"] in (JobStatus.COMPLETED, JobStatus.FAILED):
        await decrement_user_jobs(job.get("user_id", ""), redis)

    return JobResult(
        job_id=job["job_id"],
        status=job["status"],
        answer=job.get("answer"),
        error=job.get("error"),
        input_tokens=job.get("input_tokens", 0),
        output_tokens=job.get("output_tokens", 0),
        cost_usd=job.get("cost_usd", 0.0),
        duration_secs=job.get("duration_secs", 0.0),
        created_at=job["created_at"],
        completed_at=job.get("completed_at"),
    )

@app.get("/v1/agent/jobs")
async def list_user_jobs(user_id: str, request: Request, _key: str = Depends(require_api_key)):
    """Return all active job IDs for a user."""
    redis = request.app.state.redis
    count = await redis.get(f"user_jobs:{user_id}")
    return {"user_id": user_id, "active_jobs": int(count or 0)}