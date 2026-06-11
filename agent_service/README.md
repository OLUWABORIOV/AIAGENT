# LLM Agent Service

Production-ready FastAPI service for running LLM agents asynchronously.

**Stack:** FastAPI · LangGraph · arq · Redis · Docker · Gemini

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

## Quick Start

```bash
# 1. Clone and configure
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
├── docker-compose.yml          # Local dev
├── docker-compose.prod.yml     # Production overrides
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

# Scale workers (e.g., when load increases)
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
`aioredis` for our job state (clean get/set/expire). arq pool for its own queue protocol. Same Redis server, different usage patterns.

**Why fakeredis in tests?**
Fast, isolated, no infrastructure needed. Each test gets a fresh instance. CI works without any real Redis.
