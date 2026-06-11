# app/config.py
import json

from pydantic_settings import BaseSettings
from pydantic import Field, field_validator

class Settings(BaseSettings):
    # API
    api_title: str = "LLM Agent Service"
    api_version: str = "0.1.0"
    debug: bool = False

    # Auth
    api_key_header: str = "X-API-Key"
    api_keys: list[str] = Field(default_factory=list)

    @field_validator("api_keys", mode="before")
    @classmethod
    def parse_api_keys(cls, value):
        if value is None:
            return []
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return []
            try:
                return json.loads(value)
            except ValueError:
                return [item.strip() for item in value.split(",") if item.strip()]
        return value

    # Gemini
    gemini_api_key: str
    gemini_model: str = "gemini-3-flash"

    # Redis / arq
    redis_url: str = "redis://redis:6379"
    max_jobs_per_user: int = 3      # concurrent job limit
    job_timeout_secs: int = 300     # 5 min hard limit per job
    job_ttl_secs: int = 3600        # keep results for 1 hour

    # Cost guard
    max_tokens_per_job: int = 50_000
    max_cost_usd_per_job: float = 0.50

    class Config:
        env_file = ".env"

settings = Settings()