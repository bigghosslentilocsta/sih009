"""Pydantic schemas for Module A - geospatial exploration & reserve mapping."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class AnalyzeZoneRequest(BaseModel):
    """Analyse a mining lease block described by a GeoJSON Polygon."""

    name: str = Field(default="Unnamed Zone", max_length=120)

    # A GeoJSON geometry object: {"type": "Polygon", "coordinates": [[[lng, lat], ...]]}
    geometry: dict[str, Any] = Field(
        ...,
        description="GeoJSON Polygon geometry in WGS84 (EPSG:4326).",
    )

    # Coarse grid used to paint the heatmap overlay (cells per axis).
    grid_resolution: int = Field(default=12, ge=4, le=40)
    include_heatmap: bool = True

    # Sentinel-2 scene filtering.
    cloud_cover_max: int = Field(default=20, ge=0, le=100, description="Max % cloud per scene.")
    years_history: int = Field(default=2, ge=1, le=10)

    # When Earth Engine is unavailable, fall back to a deterministic model
    # instead of failing the request. Set False to fail loudly.
    allow_simulation_fallback: bool = True

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "Balaghat Block",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [79.05, 22.15],
                            [79.25, 22.15],
                            [79.25, 22.32],
                            [79.05, 22.32],
                            [79.05, 22.15],
                        ]
                    ],
                },
                "grid_resolution": 12,
            }
        }
    }


class GeologicalIndicators(BaseModel):
    """Spectral / terrain proxies for lateritic manganese occurrence."""

    # Ferric iron oxide proxy (red / blue). Laterites score high.
    iron_oxide_ratio: float = Field(..., description="B4 / B2 reflectance ratio.")
    # Clay mineral absorption proxy. High values indicate argillic alteration.
    clay_index: float = Field(..., description="(B11 - B8) / (B11 + B8).")
    # Vegetation density. Low NDVi indicates exposed, barren laterite.
    ndvi: float = Field(..., description="(B8 - B4) / (B8 + B4).")
    # Red-edge to red ratio, a second iron-oxide confirmation.
    red_edge_ratio: float = Field(..., description="B5 / B4 reflectance ratio.")

    elevation_m: float | None = Field(None, description="Mean elevation from SRTM 30 m.")
    slope_deg: float | None = Field(None, description="Mean terrain slope in degrees.")

    band_means: dict[str, float] = Field(
        default_factory=dict, description="Mean reflectance per Sentinel-2 band."
    )


class ScoreBreakdown(BaseModel):
    """Per-factor contribution to the final suitability score (each 0-100)."""

    iron_oxide: float
    clay_mineral: float
    vegetation_exposure: float
    terrain: float


class HeatmapCell(BaseModel):
    lat: float
    lng: float
    score: float = Field(..., ge=0, le=100)


class ZoneAnalysisResponse(BaseModel):
    zone_id: str
    name: str

    suitability_score: float = Field(..., ge=0, le=100, description="Overall probability (%).")
    classification: Literal[
        "very_high", "high", "moderate", "low", "very_low"
    ]
    confidence_level: Literal["high", "medium", "low"]
    confidence_score: float = Field(..., ge=0, le=1)

    # "earth_engine" = live satellite analysis, "simulated" = fallback model.
    data_source: str
    fallback_reason: str | None = None

    geological_indicators: GeologicalIndicators
    breakdown: ScoreBreakdown

    area_km2: float
    cell_count: int

    heatmap: list[HeatmapCell] = Field(default_factory=list)
    boundary: dict[str, Any] = Field(..., description="Echo of the submitted GeoJSON Polygon.")

    recommendation: str
    analyzed_at: datetime
