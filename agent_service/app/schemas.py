from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class JobStatus(StrEnum):
    QUEUED    = "queued"
    RUNNING   = "running"
    COMPLETED = "completed"
    FAILED    = "failed"
    CANCELLED = "cancelled"


class AgentRequest(BaseModel):
    # ✅ Field(pattern=...) replaces constr(regex=...) in Pydantic v2
    question: str = Field(..., min_length=1, max_length=4000)
    user_id:  str = Field(..., min_length=1, pattern=r"^[A-Za-z0-9_-]+$")
    documents: List[str] = Field(default_factory=list)
    session_id: Optional[str] = None

    # ✅ field_validator replaces @validator in Pydantic v2
    @field_validator("question", mode="before")
    @classmethod
    def strip_question(cls, v: str) -> str:
        return v.strip()

    @field_validator("user_id", mode="before")
    @classmethod
    def strip_user_id(cls, v: str) -> str:
        return v.strip()

    @field_validator("documents")
    @classmethod
    def validate_documents_length(cls, value: List[str]) -> List[str]:
        if len(value) > 10:
            raise ValueError("A maximum of 10 documents is allowed")
        return value


class JobResponse(BaseModel):
    job_id:     str
    status:     JobStatus
    created_at: datetime
    poll_url:   str


class JobResult(BaseModel):
    job_id:        str
    status:        JobStatus
    answer:        Optional[str] = None
    error:         Optional[str] = None
    input_tokens:  int   = 0
    output_tokens: int   = 0
    cost_usd:      float = 0.0
    duration_secs: float = 0.0
    steps_taken:   int   = 0
    created_at:    str   = ""
    completed_at:  Optional[str] = None

    @property
    def is_terminal(self) -> bool:
        return self.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED)


class JobRecord(BaseModel):
    job_id:        str
    status:        JobStatus
    user_id:       str
    created_at:    str
    answer:        Optional[str] = None
    error:         Optional[str] = None
    input_tokens:  int   = 0
    output_tokens: int   = 0
    cost_usd:      float = 0.0
    duration_secs: float = 0.0
    steps_taken:   int   = 0
    started_at:    Optional[str] = None
    completed_at:  Optional[str] = None


@dataclass
class AgentOutput:
    answer:        str
    input_tokens:  int
    output_tokens: int
    cost_usd:      float
    duration_secs: float
    steps_taken:   int