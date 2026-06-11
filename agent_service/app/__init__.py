# app/__init__.py
"""
LLM Agent Service
=================
A production-ready FastAPI service for running LangGraph agents
asynchronously via Redis-backed job queues.

Package structure:
    app/
    ├── __init__.py     ← You are here. Exposes version + package metadata.
    ├── config.py       ← All settings loaded from environment variables
    ├── schemas.py      ← Pydantic models for requests, responses, job state
    ├── logger.py       ← Structured JSON logging (structlog)
    ├── agent.py        ← LangGraph agent graph + run_agent() entry point
    ├── worker.py       ← arq worker: picks up jobs from Redis queue
    ├── middleware.py   ← Auth, rate limiting, request ID injection
    └── main.py         ← FastAPI app, routes, lifespan (Redis pool)

Why this structure?
    - config.py is imported everywhere — keeping it separate avoids circular imports
    - agent.py has no FastAPI dependency — it can be tested in isolation
    - worker.py has no FastAPI dependency — it runs in a separate process entirely
    - middleware.py keeps cross-cutting concerns (auth, logging) out of route handlers

Async architecture:
    Client POST /v1/agent/run
        → FastAPI (main.py) validates request, stores QUEUED state in Redis
        → Enqueues job via arq into Redis list
        → Returns {job_id, poll_url} in < 50ms

    arq Worker (worker.py) — separate process
        → Picks up job from Redis queue
        → Calls run_agent() from agent.py
        → Updates job state in Redis (RUNNING → COMPLETED/FAILED)

    Client GET /v1/agent/jobs/{job_id}
        → FastAPI reads job state from Redis
        → Returns current status + result when ready
"""

__version__ = "0.1.0"
__author__ = "Your Name"
__description__ = "Production LLM Agent Service — FastAPI + LangGraph + arq"

# Expose version at package level so other modules can import it:
#   from app import __version__
# This is also what the FastAPI app title uses (via config.py).