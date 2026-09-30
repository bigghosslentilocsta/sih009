"""
Module B - operations endpoints.

   POST /api/v1/operations/risk  production shortfall & risk assessment

The Express backend aggregates MongoDB (EquipmentLog, ShiftTarget) and the
OpenWeatherMap forecast, then posts the combined payload here.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status

from app.models.operations import RiskRequest, RiskResponse
from app.services.production_risk import assess_risk

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/operations", tags=["operations"])


@router.post(
    "/risk",
    response_model=RiskResponse,
    summary="Project production shortfall from weather and fleet condition",
    responses={422: {"description": "Invalid risk payload."}},
)
def post_operations_risk(payload: RiskRequest) -> RiskResponse:
    """Score the forecast window and return projected output plus bottlenecks.

    Pass a `scenario` to model mitigations (covered pits, extra labour,
    accelerated maintenance, spare fleet). Leave it at zero for the
    un-mitigated baseline.
    """
    try:
        result = assess_risk(payload)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Risk assessment failed")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Risk assessment failed: {exc}",
        ) from exc

    logger.info(
        "Risk: %s%% (unmitigated %.1f%%) level=%s weather=%.2f equipment=%.2f",
        result.projected_shortfall_pct,
        result.unmitigated_shortfall_pct,
        result.risk_level,
        result.weather_index,
        result.equipment_pressure,
    )
    return result
