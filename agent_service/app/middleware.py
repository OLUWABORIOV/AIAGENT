# app/middleware.py
"""
Middleware layer — runs on EVERY request before it reaches a route handler.

Three concerns handled here:
    1. Request ID injection  — every request gets a unique trace ID
    2. API Key authentication — validates the X-API-Key header
    3. Structured access logging — logs method, path, status, duration

Why middleware and not route dependencies?
    Dependencies (Depends()) run per-route. Middleware runs universally —
    you can't accidentally forget to add it to a new route. Auth and logging
    should never be optional, so middleware is the right place.
"""

import time
import uuid
import logging
from typing import Callable

from fastapi import Request, Response, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings

logger = logging.getLogger(__name__)


# ── 1. Request ID Middleware ──────────────────────────────────────────────────
# Attaches a unique UUID to every request.
# This ID is:
#   - Returned in the X-Request-ID response header (so clients can report it)
#   - Logged with every log line for that request (so you can grep a full trace)
#   - Stored in request.state so route handlers can access it
#
# Without this, when you have 50 concurrent requests all failing, you can't
# tell which log lines belong to which request. With it, you can filter your
# logs by a single ID and see the full story of one request.

class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Use the caller's request ID if provided (useful when your service
        # is called by another service that already has a trace ID)
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


# ── 2. Access Logging Middleware ──────────────────────────────────────────────
# Logs every request with:
#   - HTTP method + path
#   - Response status code
#   - Duration in milliseconds
#   - Request ID (from above middleware)
#
# This gives you a complete access log in structured JSON format that can be
# shipped to Datadog, Grafana Loki, CloudWatch, etc. without extra parsing.
# The /health endpoint is excluded — it's hit every 30s by load balancers
# and would drown out real traffic in your logs.

class AccessLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip noisy health check logs
        if request.url.path == "/health":
            return await call_next(request)

        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000

        request_id = getattr(request.state, "request_id", "-")

        log_data = {
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": round(duration_ms, 2),
            "client_ip": request.client.host if request.client else "unknown",
        }

        # Log at WARNING level for 4xx/5xx so they surface in dashboards
        if response.status_code >= 500:
            logger.error("request_complete", extra=log_data)
        elif response.status_code >= 400:
            logger.warning("request_complete", extra=log_data)
        else:
            logger.info("request_complete", extra=log_data)

        return response


# ── 3. Global Exception Handler ───────────────────────────────────────────────
# Catches any unhandled exception that bubbles up through the app.
# Without this, FastAPI returns a raw 500 with a Python traceback in the body —
# which leaks internal details and isn't JSON. This ensures every error response
# is a consistent JSON shape that clients can parse reliably.
#
# Usage: register this with app.add_exception_handler(Exception, global_exception_handler)
# in main.py (not as middleware — FastAPI has a separate exception handler API).

async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "-")

    logger.exception(
        "unhandled_exception",
        extra={
            "request_id": request_id,
            "path": request.url.path,
            "error": str(exc),
        },
    )

    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "request_id": request_id,  # client can quote this in a bug report
        },
    )


# ── 4. API Key Auth — FastAPI Dependency ─────────────────────────────────────
# This is a FastAPI Dependency (not middleware) because auth needs to be
# selective — the /health endpoint must be public (load balancers need it),
# but all /v1/* routes require a key.
#
# Usage in routes:
#   @app.post("/v1/agent/run")
#   async def submit_job(body: AgentRequest, _key: str = Depends(require_api_key)):
#
# The API keys are loaded from the API_KEYS env var as a comma-separated list:
#   API_KEYS=key-abc123,key-def456
# This lets you issue different keys to different clients and revoke one
# without affecting others.

from fastapi import Depends
from fastapi.security import APIKeyHeader

_api_key_scheme = APIKeyHeader(name=settings.api_key_header, auto_error=False)


async def require_api_key(key: str = Depends(_api_key_scheme)) -> str:
    """
    FastAPI dependency. Raises 401 if the key is missing or not in the
    configured API_KEYS list.

    Returns the validated key so route handlers can log which key was used.
    """
    if not key:
        raise HTTPException(
            status_code=401,
            detail=f"Missing {settings.api_key_header} header",
        )
    if settings.api_keys and key not in settings.api_keys:
        raise HTTPException(
            status_code=401,
            detail="Invalid API key",
        )
    return key


# ── 5. Per-User Concurrency Limiter ──────────────────────────────────────────
# LLM agents are expensive. Without this, one user could submit 100 jobs and
# consume all your worker capacity, starving everyone else.
#
# This uses Redis as the counter store — it works correctly even when you're
# running multiple API replicas (unlike an in-process dict, which would only
# track jobs submitted to that one replica).
#
# The counter is incremented when a job is submitted and decremented when
# the client polls a completed/failed job. A TTL equals the job timeout,
# so the counter auto-expires even if the client never polls for the result.

import redis.asyncio as aioredis


async def check_user_job_limit(user_id: str, redis: aioredis.Redis) -> None:
    """
    Raises 429 if the user already has max_jobs_per_user active jobs.
    Call this BEFORE enqueuing a new job.
    """
    key = f"user_jobs:{user_id}"
    count = await redis.get(key)

    if count and int(count) >= settings.max_jobs_per_user:
        raise HTTPException(
            status_code=429,
            detail=(
                f"You already have {settings.max_jobs_per_user} active jobs. "
                f"Wait for one to complete before submitting another."
            ),
        )

    # Increment and set TTL atomically-ish (Redis is single-threaded, safe)
    await redis.incr(key)
    await redis.expire(key, settings.job_timeout_secs)


async def decrement_user_job_count(user_id: str, redis: aioredis.Redis) -> None:
    """
    Decrement the user's active job count when a job finishes.
    Call this in the GET /jobs/{id} route when status is COMPLETED or FAILED.
    Safe to call multiple times — won't go below zero.
    """
    key = f"user_jobs:{user_id}"
    count = await redis.get(key)
    if count and int(count) > 0:
        await redis.decr(key)