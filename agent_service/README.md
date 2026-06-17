# LLM Agent Service

![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green?logo=fastapi)
![Tests](https://img.shields.io/badge/tests-16%20passing-brightgreen)
![Docker](https://img.shields.io/badge/Docker-ready-blue?logo=docker)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

> A production-grade async API service that runs LLM agents in the background. Submit a question, get a job ID back in under 50ms, poll for the result when Gemini is done. Built by **Oluwabori Odeyale** self-taught AI Backend Engineer, Lagos, Nigeria.

---

## What This Project Does

Most LLM demos call an AI model directly inside a web request and hope it responds in time. This project solves the real production problem: **LLM agents take 30–120 seconds far too long to block an HTTP connection.**

The solution is a **decoupled async architecture**:

1. A client POSTs a question → gets a `job_id` back in **under 50ms**
2. The agent runs in a **background worker process** (LangGraph + Gemini)
3. The result is stored in **Redis** when ready
4. The client polls `GET /v1/agent/jobs/{id}` until `status: completed`

This is the same pattern used by OpenAI's Batch API, Stripe's async payments, and any production system that does slow work without blocking the user.

**What it handles out of the box:**

- ✅ API key authentication on every route
- ✅ Per-user concurrent job limiting (rate limiting via Redis)
- ✅ Per-job token and cost tracking (input/output tokens → USD)
- ✅ Automatic job timeout and cost cap enforcement
- ✅ Structured JSON logging with request IDs for full traceability
- ✅ Horizontal worker scaling add more workers with one command
- ✅ 16 automated tests covering auth, rate limiting, agent logic, and schemas

---

## Stack

| Layer                | Technology                                  | Purpose                                          |
| -------------------- | ------------------------------------------- | ------------------------------------------------ |
| **Language**         | Python 3.12                                 | Async-native, richest AI ecosystem               |
| **API Framework**    | FastAPI + Uvicorn                           | Async HTTP, auto-validation, auto-docs           |
| **Agent Framework**  | LangGraph                                   | State machine for the ReAct agent loop           |
| **LLM Provider**     | Google Gemini API                           | 1M token context window, competitive pricing     |
| **Job Queue**        | arq                                         | Async Redis queue — jobs survive worker restarts |
| **Storage**          | Redis                                       | Job queue + result store + rate limit counters   |
| **Containerisation** | Docker + Docker Compose                     | API + worker + Redis in one command              |
| **Validation**       | Pydantic v2                                 | Request/response schemas, settings from .env     |
| **Testing**          | pytest + pytest-asyncio + httpx + AsyncMock | 16 tests, no real infrastructure needed          |
| **Logging**          | structlog                                   | Structured JSON logs with request ID correlation |
| **Observability**    | Langfuse / LangSmith                        | LLM tracing, token usage, cost per run           |

---

## Architecture

```
Client
  │
  ▼
FastAPI (api container)
  │  POST /v1/agent/run → returns job_id immediately (HTTP 202)
  │  GET  /v1/agent/jobs/{id} → poll for result
  │
  ▼
Redis Queue
  │
  ▼
arq Worker (worker container)
  │  dequeues job → runs LangGraph agent → writes result to Redis
  │
  ▼
Gemini API
```

---

## Prerequisites

Make sure you have these installed before starting:

- **Python 3.11+** — python.org
- **Docker Desktop** — docker.com/products/docker-desktop
- **Gemini API Key** — aistudio.google.com → Get API key (free tier available)

---

## Quick Start

```bash
# 1. Clone and configure
git clone https://github.com/OLUWABORIOV/agent_service.git
cd agent_service
cp .env.example .env
# Edit .env — add your GEMINI_API_KEY

# 2. Start everything
docker compose up -d

# 3. Submit a job
python scripts/client.py "What is the capital of France?"

# 4. Or use curl
curl -X POST http://localhost:8000/v1/agent/run \
  -H "Content-Type: application/json" \
  -d '{"question": "What is 7 * 8?", "user_id": "me"}'

# 5. Poll for result (replace JOB_ID with the id from step 4)
curl http://localhost:8000/v1/agent/jobs/JOB_ID
```

Open **http://localhost:8000/docs** in your browser for the interactive API documentation.

---

## Project Structure

```
agent_service/
├── app/
│   ├── config.py      # All settings — reads from .env
│   ├── schemas.py     # Pydantic request/response models
│   ├── logger.py      # Structured JSON logging
│   ├── agent.py       # LangGraph agent (the actual AI logic)
│   ├── worker.py      # arq worker — runs agent jobs from the queue
│   ├── middleware.py  # Auth, rate limiting, request IDs
│   └── main.py        # FastAPI app, routes, lifespan
├── tests/
│   ├── conftest.py    # Shared fixtures (fakeredis, mock clients)
│   ├── test_api.py    # HTTP endpoint tests
│   ├── test_agent.py  # Agent logic unit tests
│   ├── test_worker.py # Worker function tests
│   └── test_schemas.py# Pydantic model tests
├── scripts/
│   └── client.py      # Example client (submit + poll)
├── Dockerfile
├── docker-compose.yml
├── docker-compose.prod.yml
├── pyproject.toml
└── .env.example
```

---

## API Reference

### POST /v1/agent/run

Submit a question to the agent.

**Request:**

```json
{
  "question": "What is the capital of France?",
  "user_id": "user_123",
  "documents": ["optional context doc 1", "optional context doc 2"]
}
```

**Response (HTTP 202):**

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "created_at": "2026-04-01T12:00:00Z",
  "poll_url": "/v1/agent/jobs/550e8400..."
}
```

### GET /v1/agent/jobs/{job_id}

Poll for job status and result.

**Response (completed):**

```json
{
  "job_id": "550e8400...",
  "status": "completed",
  "answer": "Paris is the capital of France.",
  "input_tokens": 150,
  "output_tokens": 12,
  "cost_usd": 0.00063,
  "duration_secs": 1.24,
  "steps_taken": 1
}
```

**Status values:** `queued` → `running` → `completed` | `failed` | `cancelled`

### DELETE /v1/agent/jobs/{job_id}

Cancel a queued job.

### GET /v1/users/{user_id}/jobs

Get active job count for a user.

### GET /health

Health check. Returns 503 if Redis is down.

---

## Running Tests

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=term-missing

# Run a specific test file
pytest tests/test_api.py -v

# Run a specific test
pytest tests/test_agent.py::TestRunAgent::test_cost_is_calculated_correctly -v
```

**No real Redis or Gemini API key needed for tests** — we use fakeredis and mock the LLM client.

---

## Production Deployment

```bash
# Deploy with production settings
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Scale workers
docker compose up -d --scale worker=8

# View logs
docker compose logs -f worker
docker compose logs -f api

# Restart a service without downtime
docker compose up -d --no-deps api
```

---

## Configuration

All settings are in `.env`. See `.env.example` for the full list.

| Variable               | Default              | Description                        |
| ---------------------- | -------------------- | ---------------------------------- |
| `GEMINI_API_KEY`       | required             | Your Gemini API key                |
| `API_KEYS`             | empty (no auth)      | Comma-separated valid API keys     |
| `REDIS_URL`            | `redis://redis:6379` | Redis connection string            |
| `MAX_JOBS_PER_USER`    | `3`                  | Max concurrent jobs per user       |
| `JOB_TIMEOUT_SECS`     | `300`                | Kill job after this many seconds   |
| `MAX_TOKENS_PER_JOB`   | `50000`              | Token budget per job               |
| `MAX_COST_USD_PER_JOB` | `0.50`               | Cost cap per job                   |
| `DEBUG`                | `false`              | Pretty logs if true, JSON if false |

---

## Key Design Decisions

**Why async queues?**
LLM agents can take 30–120 seconds. Blocking an HTTP connection that long fails under any load and hits timeouts. The queue decouples request acceptance from job execution.

**Why arq over Celery?**
arq is built on asyncio — same mental model as FastAPI. No separate broker format. Jobs are plain async Python functions.

**Why two Redis clients?**
`aioredis` for job state (clean get/set/expire). arq pool for its own queue protocol. Same Redis server, different usage patterns.

**Why fakeredis in tests?**
Fast, isolated, no infrastructure needed. Each test gets a fresh instance. CI works without any real Redis.

See TRADEOFFS.md for the full architecture decision record — every technology choice, what was rejected, and why.

---

## What I Learned

This project was built as a deep dive into production AI engineering patterns. Coming from an English Language background with no formal CS training, every concept here was learned by building, breaking, and rebuilding.

**The biggest technical lessons:**

**Async Python is not optional for AI services.** The first version blocked on every LLM call. Under any concurrent load it collapsed immediately. Rebuilding around asyncio, arq, and non-blocking Redis operations was the most impactful architectural change — and the most educational.

**Mocking is a skill, not a shortcut.** Writing 16 tests without real Redis or a real LLM forced me to deeply understand what each component actually does and what contract it exposes. AsyncMock for async Redis operations, ASGITransport for in-process HTTP requests, and @patch for the Gemini client — each mock taught me more about the thing it was replacing than using the real thing did.

**Production patterns are not about complexity — they are about failure modes.** Every design decision came down to one question: what happens when this fails? The queue survives API restarts. Separate workers survive crashes. Typed state catches bugs at definition time. Middleware cannot be accidentally omitted.

**The gap between "it works" and "it is reliable" is enormous.** Getting an LLM to respond to a question took an afternoon. Making that reliable under load, with proper error handling, cost controls, auth, rate limiting, structured logging, and automated tests took weeks. That gap is production engineering.

**What I would do differently:**

- Add WebSocket support for real-time streaming instead of polling
- Persistent job history in PostgreSQL alongside the Redis TTL store
- A proper CI/CD pipeline (GitHub Actions) running tests on every push
- Evaluation pipeline (RAGAS + LLM-as-judge) integrated into the test suite

---

## Author

**Oluwabori Odeyale** — AI Backend Engineer
Self-taught · Lagos, Nigeria · Building production AI systems from scratch

- GitHub: github.com/OLUWABORIOV
- LinkedIn: linkedin.com/in/oluwabori-odeyale
- Email: odeyaleoluwabori@gmail.com

---

## License

MIT — use freely, attribution appreciated.
