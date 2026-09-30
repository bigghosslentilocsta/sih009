"""SIH 26009 - Manganese reserve identification & production shortfall prediction.

FastAPI entrypoint for the ai-service. Run with:

    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.models.schemas import HealthResponse
from app.routers import exploration, gee, operations
from app.services.gee_client import gee_status

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("sih26009.ai-service")

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Geospatial analytics for manganese (Mn) reserve identification and "
        "production shortfall prediction."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(gee.router, prefix=settings.api_v1_prefix)
app.include_router(exploration.router, prefix=settings.api_v1_prefix)
app.include_router(operations.router, prefix=settings.api_v1_prefix)


@app.get("/", tags=["system"], summary="Service banner")
def read_root() -> dict[str, str]:
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/health",
        "api": settings.api_v1_prefix,
    }


@app.get("/health", response_model=HealthResponse, tags=["system"], summary="Liveness probe")
def read_health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
    )


@app.get(f"{settings.api_v1_prefix}/status", tags=["system"], summary="Dependency status")
def read_status() -> dict[str, object]:
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "earth_engine": gee_status(),
    }


if __name__ == "__main__":  # pragma: no cover - local dev convenience
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
