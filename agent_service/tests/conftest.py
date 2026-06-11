"""
conftest.py — Shared pytest fixtures.

TEACHING NOTE — What is conftest.py?
  pytest automatically discovers and loads conftest.py files.
  Fixtures defined here are available to ALL tests in the same directory
  and all subdirectories — no import needed.

TEACHING NOTE — What is a fixture?
  A fixture is a function that sets up (and tears down) test dependencies.
  Instead of each test creating its own client/db/redis, fixtures do it
  once (or per-test) and inject the result.

  @pytest.fixture(scope="session")   → created once per test session
  @pytest.fixture(scope="module")    → created once per test file
  @pytest.fixture                    → created fresh for each test function

TEACHING NOTE — Why fakeredis?
  Tests must be:
  1. Fast — real Redis adds 1–10ms per command; fakeredis is in-memory
  2. Isolated — one test's data must not affect another
  3. No dependencies — CI runs without a real Redis server

  fakeredis mimics the Redis API exactly. Your code doesn't know the difference.
"""

import pytest
import pytest_asyncio
import fakeredis.aioredis as fake_aioredis
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, patch

from app.main import app
from app.config import settings
from app.schemas import AgentOutput


# ── Redis fixture ─────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def fake_redis():
    """
    In-memory Redis. Each test gets a fresh, empty instance.
    Automatically cleaned up after each test.
    """
    r = fake_aioredis.FakeRedis(decode_responses=True)
    yield r
    await r.aclose()


# ── App fixtures ──────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client(fake_redis):
    """
    TEACHING NOTE:
      We use httpx.AsyncClient with ASGITransport to test FastAPI
      without starting a real HTTP server. Requests go directly to the
      ASGI app in-process — fast and no port conflicts.

      We patch app.state.redis and app.state.arq so the app uses
      our fake Redis and a mock arq pool instead of real ones.
    """
    # Mock arq pool — we don't want to actually enqueue jobs in tests
    mock_arq = AsyncMock()
    mock_arq.enqueue_job = AsyncMock(return_value=AsyncMock(job_id="test-job-id"))

    app.state.redis = fake_redis
    app.state.arq = mock_arq

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers={"X-API-Key": "test-key"},
    ) as ac:
        yield ac


@pytest_asyncio.fixture
async def authed_client(client):
    """
    Client with a valid API key pre-set.
    TEACHING NOTE: most tests need auth — this saves repeating the header.
    """
    # API_KEYS is empty by default in test settings → all keys accepted
    return client


# ── Agent output fixture ───────────────────────────────────────────────────────

@pytest.fixture
def mock_agent_output():
    """A realistic AgentOutput for mocking run_agent()."""
    return AgentOutput(
        answer="Paris is the capital of France.",
        input_tokens=150,
        output_tokens=12,
        cost_usd=0.000630,
        duration_secs=1.24,
        steps_taken=1,
    )


@pytest.fixture
def mock_run_agent(mock_agent_output):
    """
    TEACHING NOTE:
      We mock run_agent() in API and worker tests because:
      1. We're testing the API/worker logic, not the agent logic
      2. Real agent calls need an API key and make HTTP requests
      3. They're slow and non-deterministic

      We test run_agent() separately in test_agent.py with its own mocks.
    """
    with patch("app.worker.run_agent", return_value=mock_agent_output) as mock:
        yield mock


# ── Settings override ─────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def override_settings(monkeypatch):
    """
    TEACHING NOTE:
      autouse=True means this fixture runs for EVERY test automatically.
      We override settings that would fail in a test environment:
      - api_keys: empty → all keys accepted (no real key needed)
      - gemini_api_key: set to a dummy (real agent tests mock the client)
    """
    monkeypatch.setattr(settings, "api_keys", [])            # no auth in tests
    monkeypatch.setattr(settings, "gemini_api_key", "test-gemini-key")
    monkeypatch.setattr(settings, "max_jobs_per_user", 10)   # high limit for tests
