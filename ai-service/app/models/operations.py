"""Pydantic schemas for Module B - production shortfall & risk prediction."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Inputs (the backend aggregates MongoDB + OpenWeatherMap and posts these)
# ---------------------------------------------------------------------------
class WeatherSlot(BaseModel):
    """One forecast timestep, normalised from the OpenWeatherMap response."""

    date: date
    rainfall_mm: float = Field(0.0, ge=0, description="Precipitation volume for the slot.")
    temp_c: float | None = None
    wind_speed_ms: float | None = None
    humidity_pct: float | None = None
    description: str = ""


class MachineState(BaseModel):
    """Current condition of one machine, from the EquipmentLog collection."""

    machine_id: str
    type: str
    status: Literal["active", "maintenance", "down"]
    sector: str | None = None
    hours_active: float = Field(0.0, ge=0)
    downtime_hours: float = Field(0.0, ge=0)
    days_until_maintenance: int | None = None
    failure_probability: float = Field(0.0, ge=0, le=1)
    notes: str = ""


class Scenario(BaseModel):
    """Mitigation levers driven by the dashboard's scenario simulator."""

    # 0-1: share of extraction moved to covered / indoor pits.
    covered_pit_fraction: float = Field(0.0, ge=0, le=1)
    # 0-1: extra labour pulled in (overtime, redeployment).
    labor_shift_fraction: float = Field(0.0, ge=0, le=1)
    # 0-1: maintenance brought forward / accelerated.
    maintenance_acceleration: float = Field(0.0, ge=0, le=1)
    # 0-1: spare / hired equipment added to the fleet.
    fleet_surge_fraction: float = Field(0.0, ge=0, le=1)


class RiskRequest(BaseModel):
    weather: list[WeatherSlot] = Field(default_factory=list)
    equipment: list[MachineState] = Field(default_factory=list)

    # Historical performance, aggregated by the backend from ShiftTarget.
    historical_attainment_pct: float = Field(
        92.0, ge=0, le=200, description="Recent actual/target as a percentage."
    )
    daily_target_tonnes: float = Field(
        900.0, gt=0, description="Mean daily target used to express the shortfall in tonnes."
    )

    horizon_days: int = Field(7, ge=1, le=16)
    scenario: Scenario = Field(default_factory=Scenario)

    model_config = {
        "json_schema_extra": {
            "example": {
                "weather": [
                    {"date": "2026-09-30", "rainfall_mm": 12.5, "description": "moderate rain"},
                    {"date": "2026-10-01", "rainfall_mm": 38.0, "description": "heavy rain"},
                ],
                "equipment": [
                    {
                        "machine_id": "EXC-04",
                        "type": "Excavator",
                        "status": "maintenance",
                        "days_until_maintenance": 2,
                        "failure_probability": 0.62,
                    }
                ],
                "historical_attainment_pct": 90.1,
                "daily_target_tonnes": 900,
                "horizon_days": 7,
                "scenario": {"covered_pit_fraction": 0.2, "labor_shift_fraction": 0.1},
            }
        }
    }

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------
class Bottleneck(BaseModel):
    """A single, human-readable risk the operations team can act on."""

    code: str
    severity: Literal["info", "warning", "critical"]
    title: str
    detail: str
    # Estimated contribution to the shortfall, in percentage points.
    impact_pct: float = 0.0
    machines: list[str] = Field(default_factory=list)
    recommendation: str = ""


class DailyProjection(BaseModel):
    date: date
    target_tonnes: float
    projected_tonnes: float
    projected_shortfall_pct: float = Field(..., ge=0, le=100)
    rainfall_mm: float
    weather_component: float
    equipment_component: float


class EquipmentSummary(BaseModel):
    total: int
    active: int
    maintenance: int
    down: int
    availability_pct: float
    mean_failure_probability: float
    maintenance_due_soon: int
    overdue_maintenance: int
    by_type: dict[str, int] = Field(default_factory=dict)
    by_status: dict[str, int] = Field(default_factory=dict)


class WeatherSummary(BaseModel):
    horizon_days: int
    total_rainfall_mm: float
    peak_daily_rainfall_mm: float
    heavy_rain_days: int
    severity_index: float = Field(..., ge=0, le=1)
    worst_day: date | None = None


class ModelCoefficients(BaseModel):
    """The exact weights used to compute the projection.

    Returned so the dashboard's scenario simulator can recompute projections in
    real time with the identical formula, instead of re-calling this API on
    every slider movement.
    """

    base_shortfall_pct: float
    weather_weight: float
    equipment_weight: float
    labor_relief_pct: float
    covered_pit_relief: float
    # Fraction of the equipment impact removed by accelerated maintenance.
    maintenance_relief_factor: float
    fleet_surge_relief_pct: float
    severe_rain_mm: float
    heavy_rain_mm: float
    maintenance_due_soon_days: int


class RiskResponse(BaseModel):
    baseline_shortfall_pct: float = Field(..., ge=0, le=100)
    projected_shortfall_pct: float = Field(..., ge=0, le=100)
    projected_shortfall_tonnes: float
    risk_level: Literal["low", "moderate", "high", "critical"]
    confidence_score: float = Field(..., ge=0, le=1)

    weather_index: float = Field(..., ge=0, le=1)
    equipment_pressure: float = Field(..., ge=0, le=1)

    weather_summary: WeatherSummary
    equipment_summary: EquipmentSummary
    bottlenecks: list[Bottleneck] = Field(default_factory=list)
    daily_projection: list[DailyProjection] = Field(default_factory=list)

    scenario: Scenario
    # The un-mitigated projection, so the UI can show what the levers bought.
    unmitigated_shortfall_pct: float

    model_coefficients: ModelCoefficients
    generated_at: datetime
