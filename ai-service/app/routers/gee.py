"""Earth Engine backed endpoints.

These are intentionally thin: they validate input, delegate to
`app.services.gee_client`, and shape the response. Domain logic for manganese
reserve identification will live in dedicated service modules.
"""

from __future__ import annotations

import ee
from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import ElevationSampleResponse, GeeStatusResponse
from app.services.gee_client import GEEInitializationError, gee_status, get_ee

router = APIRouter(prefix="/gee", tags=["earth-engine"])


@router.get("/status", response_model=GeeStatusResponse, summary="Check the Earth Engine session")
def read_gee_status() -> GeeStatusResponse:
    return GeeStatusResponse(**gee_status())


@router.get(
    "/elevation",
    response_model=ElevationSampleResponse,
    summary="Sample SRTM elevation at a point",
)
def read_elevation(
    latitude: float = Query(..., ge=-90, le=90, description="Latitude in WGS84 degrees"),
    longitude: float = Query(..., ge=-180, le=180, description="Longitude in WGS84 degrees"),
) -> ElevationSampleResponse:
    """Sample the NASA SRTM 30 m DEM - a building block for terrain screening."""
    try:
        image = get_ee().Image("USGS/SRTMGL1_003")
        point = ee.Geometry.Point([longitude, latitude])
        value = (
            image.reduceRegion(
                reducer=ee.Reducer.first(),
                geometry=point,
                scale=30,
                maxPixels=1,
            )
            .get("elevation")
            .getInfo()
        )
    except GEEInitializationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - network/EE errors are opaque
        raise HTTPException(status_code=502, detail=f"Earth Engine request failed: {exc}") from exc

    return ElevationSampleResponse(
        latitude=latitude,
        longitude=longitude,
        elevation_m=value,
        source="USGS/SRTMGL1_003",
    )
