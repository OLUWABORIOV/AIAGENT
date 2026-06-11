# AI-Powered LLM Agent Service — Case Study

## Overview

Built a production-ready FastAPI service that runs LLM agents asynchronously, processing user queries through Google Gemini with job queuing, worker management, and real-time polling.

---

## Question 1: Process Improved/Automated with AI

### The Problem

Traditional synchronous request-response patterns fail when integrating LLM services:

- LLM calls take 30–120 seconds
- HTTP connections timeout under load
- User experience degrades waiting for results

### The Solution: Async Job Queue Architecture

**Approach:**

1. **Decoupled architecture**: Separated API layer from job processing using Redis queues
   - Client submits question → API returns `job_id` immediately (HTTP 202)
   - Worker processes job asynchronously in background
   - Client polls for result via `GET /v1/agent/jobs/{job_id}`

2. **Tech stack selection**:
   - **FastAPI** for async HTTP API (built on asyncio)
   - **arq** for Redis-backed job queue (lightweight, asyncio-native)
   - **LangGraph** for agent orchestration with structured reasoning
   - **Google Gemini** for LLM inference
   - **Docker Compose** for reproducible environment

3. **Key features implemented**:
   - Per-user rate limiting (max 3 concurrent jobs)
   - Job timeout enforcement (300 seconds)
   - Cost tracking per request (USD per token)
   - Input/output token counting
   - API key authentication

### Impact

- **Throughput**: Handles multiple concurrent long-running jobs without blocking
- **Reliability**: Job state persisted in Redis; jobs survive service restarts
- **Scalability**: Can scale workers independently (`docker compose up -d --scale worker=8`)
- **Observability**: Structured JSON logging; per-job execution metrics
- **Cost control**: Token budgets and cost caps prevent runaway expenses

**Result**: Production-ready system processing AI queries at scale without user-facing timeouts.

---

## Question 2: Remote Work Availability

**Yes.** All development and deployment happens in code/containers:

- VS Code for editing
- Docker for environment consistency across machines
- Git for version control
- Cloud-native design (runs on any machine with Docker + Python 3.12+)
- No local infrastructure dependencies (Redis runs in container)

---

## Question 3: Travel for All-Company Meetings

**Yes.** Can accommodate occasional travel for team meetings and company events.

---

## Technical Highlights for Interview

### Architecture Decision: Why This Approach?

- **Async-first**: Python 3.12 + asyncio enables thousands of concurrent operations
- **Job queue over threads**: arq avoids GIL limits; scales horizontally
- **Mock Redis in tests**: No CI infrastructure; tests run in 2–3 seconds
- **Type safety**: Pydantic + mypy catch 80% of bugs before runtime

### Testing Strategy

```bash
pytest --cov=app --cov-report=term-missing
```

- fakeredis for isolated unit tests
- Mock LLM client to avoid API calls
- No external dependencies required

### Deployment Ready

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose up -d --scale worker=8  # Scale workers on demand
```

---

## Tools & Technologies Used

| Category              | Tools                                          |
| --------------------- | ---------------------------------------------- |
| **Language**          | Python 3.12+                                   |
| **Web Framework**     | FastAPI, Uvicorn                               |
| **LLM Stack**         | Google Gemini, LangGraph, LangChain            |
| **Job Queue**         | arq, Redis                                     |
| **Containerization**  | Docker, Docker Compose                         |
| **Config Management** | Pydantic Settings, python-dotenv               |
| **Logging**           | structlog, Langfuse                            |
| **Testing**           | pytest, pytest-asyncio, fakeredis, pytest-mock |
| **Type Checking**     | mypy                                           |
| **HTTP Client**       | httpx                                          |
| **Resilience**        | tenacity (retry logic)                         |

---

## Code Quality Highlights

- **Structured logging**: JSON output for monitoring
- **Type annotations**: Full static type checking with mypy
- **Async/await throughout**: No blocking calls
- **Graceful error handling**: Proper HTTP status codes + detail messages
- **Security**: API key validation, request rate limiting
- **Observability**: Per-job execution metrics (tokens, cost, duration)

---

## What This Demonstrates

✅ Full-stack async Python architecture  
✅ Production-grade error handling & observability  
✅ Docker containerization for reproducible deployments  
✅ Test-driven development with mocked external services  
✅ Scalable job processing without blocking  
✅ Integration with modern LLM APIs (Gemini)  
✅ Clean separation of concerns (API, worker, queue, state)

---

## Quick Start (for hiring manager review)

```bash
# Clone and setup
cd agent_service
cp .env.example .env
# Add your GEMINI_API_KEY to .env

# Start all services
docker compose up -d

# Test the API
curl http://localhost:8000/health

# Submit a job
python script/client.py "What is the capital of France?"
```

Result: Job queued → Worker processes → Result available via polling.

---

## Repository Structure

```
agent_service/
├── app/
│   ├── main.py         # FastAPI app & routes
│   ├── agent.py        # LangGraph agent logic
│   ├── worker.py       # arq worker
│   ├── schemas.py      # Pydantic models
│   ├── config.py       # Settings from .env
│   └── middleware.py   # Auth & rate limiting
├── tests/              # pytest suite (fakeredis, mocks)
├── scripts/
│   └── client.py       # Example job submission
├── Dockerfile
├── docker-compose.yml
└── pyproject.toml      # Dependencies & metadata
```
