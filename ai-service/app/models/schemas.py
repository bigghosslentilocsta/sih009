"""Pydantic request/response schemas for the ai-service."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = Field(..., examples=["ok"])
    service: str
    version: str
    environment: str


class GeeStatusResponse(BaseModel):
    project: str = Field(..., examples=["gen-lang-client-0167226131"])
    initialized: bool
    error: str | None = None


class ElevationSampleResponse(BaseModel):
    """Point elevation sample from the NASA SRTM 30 m global DEM."""

    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    elevation_m: float | None = Field(
        None, description="Elevation in metres. Null when the point falls outside SRTM coverage."
    )
    source: str = Field("USGS/SRTMGL1_003", examples=["USGS/SRTMGL1_003"])


class ErrorResponse(BaseModel):
    detail: str


class GenericPayload(BaseModel):
    """Escape hatch for endpoints still being prototyped."""

    data: dict[str, Any]
