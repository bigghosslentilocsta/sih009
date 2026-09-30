"""
Module A - geospatial exploration endpoints.

   POST /api/v1/analyze-zone  analyse a GeoJSON polygon for lateritic Mn
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status

from app.models.zone import AnalyzeZoneRequest, ZoneAnalysisResponse
from app.services.mineral_suitability import (
    InvalidGeometryError,
    analyze_zone,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["exploration"])


@router.post(
    "/analyze-zone",
    response_model=ZoneAnalysisResponse,
    summary="Analyse a mining lease block for manganese suitability",
    responses={
        422: {"description": "The submitted GeoJSON polygon is invalid."},
        503: {"description": "Earth Engine failed and simulation fallback is disabled."},
    },
)
def post_analyze_zone(payload: AnalyzeZoneRequest) -> ZoneAnalysisResponse:
    """Run the mineral-suitability model over a GeoJSON Polygon.

    Accepts either a bare Polygon geometry or a GeoJSON Feature/FeatureCollection
    and returns a 0-100 suitability score, the spectral proxies behind it, and a
    coarse heatmap grid for overlay rendering.
    """
    geometry = _extract_geometry(payload.geometry)

    try:
        result = analyze_zone(
            geometry=geometry,
            name=payload.name,
            grid_resolution=payload.grid_resolution,
            include_heatmap=payload.include_heatmap,
            cloud_cover_max=payload.cloud_cover_max,
            years_history=payload.years_history,
            allow_simulation_fallback=payload.allow_simulation_fallback,
        )
    except InvalidGeometryError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except Exception as exc:  # noqa: BLE001 - upstream GEE failures
        logger.exception("Zone analysis failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Analysis failed: {exc}",
        ) from exc

    if result["data_source"] != "earth_engine":
        logger.info("Zone %s analysed with the simulated model", result["zone_id"])

    return ZoneAnalysisResponse(**result)


def _extract_geometry(geometry: dict) -> dict:
    """Accept Polygon, Feature or FeatureCollection and return a Polygon geometry."""
    gtype = geometry.get("type")

    if gtype == "FeatureCollection":
        features = geometry.get("features") or []
        if not features:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="FeatureCollection contains no features.",
            )
        return _extract_geometry(features[0].get("geometry") or {})

    if gtype == "Feature":
        return _extract_geometry(geometry.get("geometry") or {})

    return geometry
