"""
test_schemas.py — Pydantic model validation tests.

TEACHING NOTE:
  Schemas are the contract between your API and the outside world.
  Testing them separately catches breaking changes early.
  These tests are pure Python — no HTTP, no Redis, no mocks.
  They run in microseconds.
"""

import pytest
from pydantic import ValidationError

from app.schemas import AgentRequest, JobRecord, JobResult, JobStatus


class TestAgentRequest:
    def test_valid_request(self):
        req = AgentRequest(question="What is Python?", user_id="user_001")
        assert req.question == "What is Python?"
        assert req.user_id == "user_001"
        assert req.documents == []
        assert req.session_id is None

    def test_strips_whitespace_from_question(self):
        req = AgentRequest(question="  What is Python?  ", user_id="user_001")
        assert req.question == "What is Python?"

    def test_rejects_empty_question(self):
        with pytest.raises(ValidationError):
            AgentRequest(question="", user_id="user_001")

    def test_rejects_question_over_4000_chars(self):
        with pytest.raises(ValidationError):
            AgentRequest(question="x" * 4001, user_id="user_001")

    def test_accepts_question_at_max_length(self):
        req = AgentRequest(question="x" * 4000, user_id="user_001")
        assert len(req.question) == 4000

    def test_rejects_user_id_with_special_chars(self):
        with pytest.raises(ValidationError):
            AgentRequest(question="Test", user_id="user; DROP TABLE")

    def test_accepts_user_id_with_hyphens_and_underscores(self):
        req = AgentRequest(question="Test", user_id="user-001_abc")
        assert req.user_id == "user-001_abc"

    def test_accepts_optional_documents(self):
        req = AgentRequest(
            question="Summarise",
            user_id="user_001",
            documents=["Doc 1", "Doc 2"],
        )
        assert len(req.documents) == 2

    def test_rejects_too_many_documents(self):
        with pytest.raises(ValidationError):
            AgentRequest(
                question="Summarise",
                user_id="user_001",
                documents=["doc"] * 11,  # max is 10
            )


class TestJobStatus:
    def test_string_values(self):
        assert JobStatus.QUEUED    == "queued"
        assert JobStatus.RUNNING   == "running"
        assert JobStatus.COMPLETED == "completed"
        assert JobStatus.FAILED    == "failed"
        assert JobStatus.CANCELLED == "cancelled"

    def test_is_terminal(self):
        result = JobResult(
            job_id="x", status=JobStatus.COMPLETED,
            created_at="2026-01-01T00:00:00Z"
        )
        assert result.is_terminal is True

    def test_queued_is_not_terminal(self):
        result = JobResult(
            job_id="x", status=JobStatus.QUEUED,
            created_at="2026-01-01T00:00:00Z"
        )
        assert result.is_terminal is False


class TestJobRecord:
    def test_serialises_to_json(self):
        record = JobRecord(
            job_id="abc-123",
            status=JobStatus.COMPLETED,
            user_id="user_001",
            created_at="2026-01-01T00:00:00Z",
            answer="The answer is 42.",
        )
        json_str = record.model_dump_json()
        assert "abc-123" in json_str
        assert "completed" in json_str

    def test_round_trips_through_json(self):
        original = JobRecord(
            job_id="round-trip",
            status=JobStatus.FAILED,
            user_id="user_001",
            created_at="2026-01-01T00:00:00Z",
            error="Something went wrong",
        )
        restored = JobRecord.model_validate_json(original.model_dump_json())
        assert restored.job_id == original.job_id
        assert restored.status == original.status
        assert restored.error == original.error