"""Application configuration loaded from environment variables."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

    encryption_key: str
    admin_api_key: str

    database_url: str = "sqlite:///./platform.db"

    default_llm_model: str = "gpt-4o-mini"
    default_embedding_model: str = "text-embedding-3-small"

    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
