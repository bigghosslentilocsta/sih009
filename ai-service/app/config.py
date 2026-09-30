"""Application configuration for the SIH 26009 ai-service.

All settings are environment driven and can be overridden with a local `.env`
file (see `.env.example`). Sensible defaults exist so the service boots even
with no `.env` present.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# ai-service/app/config.py -> ai-service/
BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Runtime settings for the manganese analytics AI service."""

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Service metadata ---
    app_name: str = "SIH 26009 Manganese AI Service"
    app_version: str = "0.1.0"
    environment: str = "development"
    debug: bool = True

    # --- HTTP server ---
    host: str = "0.0.0.0"
    port: int = 8000
    api_v1_prefix: str = "/api/v1"
    # Comma separated list of origins allowed to call this service.
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # --- Google Earth Engine ---
    # Cloud project that owns the Earth Engine quota.
    gee_project: str = "gen-lang-client-0167226131"
    # Optional service account credentials path (for non-interactive/CI runs).
    gee_service_account_keyfile: str | None = None

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse `cors_origins` into a clean list for the CORS middleware."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (fastapi dependency friendly)."""
    return Settings()
