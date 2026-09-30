"""
Module B - production shortfall & risk prediction.

Turns three inputs into an actionable production forecast:

  1. a weather forecast (normalised from OpenWeatherMap by the backend)
  2. the current state of the mining fleet (from EquipmentLog)
  3. recent historical attainment (from ShiftTarget)

The projection is a transparent weighted sum, not a black box:

    shortfall = base
              + weather_weight    * weather_index
              + equipment_weight  * equipment_pressure
              - labour relief
              - fleet surge relief

Every constant used is returned to the caller in `model_coefficients` so the
dashboard scenario simulator can recompute projections in real time with the
exact same arithmetic, instead of round-tripping to this service on every
slider movement.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np

from app.models.operations import (
    Bottleneck,
    DailyProjection,
    EquipmentSummary,
    MachineState,
    ModelCoefficients,
    RiskRequest,
    RiskResponse,
    Scenario,
    WeatherSummary,
    WeatherSlot,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Model constants - surfaced to the client via ModelCoefficients
# ---------------------------------------------------------------------------
COEFFICIENTS: dict[str, float] = {
    # Maximum shortfall contribution (percentage points) at full saturation.
    "weather_weight": 30.0,
    "equipment_weight": 24.0,
    # Relief each lever can buy, at full application.
    "labor_relief_pct": 5.0,
    "maintenance_relief_pct": 9.0,
    "fleet_surge_relief_pct": 7.0,
    # Fraction of the weather impact neutralised by covered / indoor pits.
    "covered_pit_relief": 0.65,
    # How much of the equipment impact accelerated maintenance removes.
    "maintenance_relief_factor": 0.70,
    # Rainfall (mm/day) at which the weather index saturates.
    "severe_rain_mm": 50.0,
    # Rainfall (mm/day) at which operational impact begins.
    "heavy_rain_mm": 7.5,
    "maintenance_due_soon_days": 7,
}

# How the equipment pressure index blends its three signals.
EQUIPMENT_MIX = {
    "unavailable": 0.50,  # share of fleet not in `active`
    "failure": 0.35,  # mean failure probability
    "maintenance": 0.15,  # share due soon or overdue
}

# Risk banding for the headline shortfall.
RISK_BANDS = ((10.0, "low"), (25.0, "moderate"), (45.0, "high"))


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return float(np.clip(value, low, high))



# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------
def aggregate_weather(slots: list[WeatherSlot], horizon_days: int) -> tuple[WeatherSummary, float]:
    """Collapse the forecast into a single 0-1 severity index.

    The index blends the **peak** day with the window **mean** so one severe
    day still registers, but a week of moderate rain registers too.
    """
    if not slots:
        return (
            WeatherSummary(
                horizon_days=horizon_days,
                total_rainfall_mm=0.0,
                peak_daily_rainfall_mm=0.0,
                heavy_rain_days=0,
                severity_index=0.0,
                worst_day=None,
            ),
            0.0,
        )

    window = slots[:horizon_days]
    rainfalls = [s.rainfall_mm for s in window]
    peak = max(rainfalls)
    mean = sum(rainfalls) / len(rainfalls)

    severe = COEFFICIENTS["severe_rain_mm"]
    severity = 0.5 * _clamp(peak / severe) + 0.5 * _clamp(mean / severe)
    worst = max(window, key=lambda s: s.rainfall_mm)

    return (
        WeatherSummary(
            horizon_days=horizon_days,
            total_rainfall_mm=round(sum(rainfalls), 1),
            peak_daily_rainfall_mm=round(peak, 1),
            heavy_rain_days=sum(1 for r in rainfalls if r >= COEFFICIENTS["heavy_rain_mm"]),
            severity_index=round(severity, 4),
            worst_day=worst.date,
        ),
        severity,
    )


def aggregate_equipment(machines: list[MachineState]) -> tuple[EquipmentSummary, float]:
    """Collapse fleet condition into a single 0-1 pressure index."""
    if not machines:
        return (
            EquipmentSummary(
                total=0, active=0, maintenance=0, down=0, availability_pct=100.0,
                mean_failure_probability=0.0, maintenance_due_soon=0, overdue_maintenance=0,
            ),
            0.0,
        )

    total = len(machines)
    by_status: dict[str, int] = {}
    by_type: dict[str, int] = {}
    for m in machines:
        by_status[m.status] = by_status.get(m.status, 0) + 1
        by_type[m.type] = by_type.get(m.type, 0) + 1

    active = by_status.get("active", 0)
    soon_days = COEFFICIENTS["maintenance_due_soon_days"]
    due_soon = sum(
        1 for m in machines
        if m.days_until_maintenance is not None and 0 <= m.days_until_maintenance <= soon_days
    )
    overdue = sum(1 for m in machines if (m.days_until_maintenance or 0) < 0)

    mean_failure = sum(m.failure_probability for m in machines) / total
    pressure = _clamp(
        EQUIPMENT_MIX["unavailable"] * ((total - active) / total)
        + EQUIPMENT_MIX["failure"] * mean_failure
        + EQUIPMENT_MIX["maintenance"] * ((due_soon + overdue) / total)
    )

    return (
        EquipmentSummary(
            total=total,
            active=active,
            maintenance=by_status.get("maintenance", 0),
            down=by_status.get("down", 0),
            availability_pct=round((active / total) * 100, 1),
            mean_failure_probability=round(mean_failure, 3),
            maintenance_due_soon=due_soon,
            overdue_maintenance=overdue,
            by_type=by_type,
            by_status=by_status,
        ),
        pressure,
    )



# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------
def score_projection(
    base_shortfall: float,
    weather_index: float,
    equipment_pressure: float,
    scenario: Scenario,
) -> dict[str, float]:
    """The single source of truth for the projection arithmetic.

    Mirrored client-side using `model_coefficients` from the response, so the
    scenario simulator stays in step with this service.
    """
    weather_component = (
        COEFFICIENTS["weather_weight"]
        * weather_index
        * (1.0 - COEFFICIENTS["covered_pit_relief"] * scenario.covered_pit_fraction)
    )
    equipment_component = (
        COEFFICIENTS["equipment_weight"]
        * equipment_pressure
        * (1.0 - COEFFICIENTS["maintenance_relief_factor"] * scenario.maintenance_acceleration)
    )
    labor_relief = COEFFICIENTS["labor_relief_pct"] * scenario.labor_shift_fraction
    surge_relief = COEFFICIENTS["fleet_surge_relief_pct"] * scenario.fleet_surge_fraction

    unmitigated = _clamp(base_shortfall + weather_component + equipment_component, 0, 100)
    projected = _clamp(unmitigated - labor_relief - surge_relief, 0, 100)

    return {
        "weather_component": round(weather_component, 2),
        "equipment_component": round(equipment_component, 2),
        "labor_relief": round(labor_relief, 2),
        "surge_relief": round(surge_relief, 2),
        "unmitigated": round(unmitigated, 2),
        "projected": round(projected, 2),
    }


def risk_level(shortfall_pct: float) -> str:
    for threshold, label in RISK_BANDS:
        if shortfall_pct < threshold:
            return label
    return "critical"


def _confidence(weather_slots: int, machines: int, attainment: float) -> float:
    """Confidence rises with data coverage."""
    score = 0.35
    score += 0.30 * min(1.0, weather_slots / 7)
    score += 0.25 * min(1.0, machines / 15)
    if attainment > 0:
        score += 0.10
    return round(_clamp(score, 0.0, 0.95), 2)


# ---------------------------------------------------------------------------
# Bottleneck detection
# ---------------------------------------------------------------------------
def detect_bottlenecks(
    machines: list[MachineState],
    weather: WeatherSummary,
    equipment_pressure: float,
    components: dict[str, float],
) -> list[Bottleneck]:
    """Produce ranked, actionable risks - ordered by severity then impact."""
    found: list[Bottleneck] = []

    down = [m for m in machines if m.status == "down"]
    in_maintenance = [m for m in machines if m.status == "maintenance"]

    if down:
        names = ", ".join(m.machine_id for m in down[:4])
        found.append(
            Bottleneck(
                code="equipment_down",
                severity="critical",
                title=f"{len(down)} machine(s) out of service",
                detail=(
                    f"{names} are down. Each unit idle removes roughly "
                    f"{100 / max(len(machines), 1):.0f}% of that class's capacity."
                ),
                impact_pct=components["equipment_component"],
                machines=[m.machine_id for m in down],
                recommendation="Prioritise repair or hire a standby unit for the affected class.",
            )
        )
    elif in_maintenance:
        names = ", ".join(m.machine_id for m in in_maintenance[:4])
        found.append(
            Bottleneck(
                code="equipment_in_maintenance",
                severity="warning",
                title=f"{len(in_maintenance)} machine(s) in scheduled maintenance",
                detail=f"{names} are off the line, overlapping the forecast window.",
                impact_pct=round(components["equipment_component"] * 0.5, 2),
                machines=[m.machine_id for m in in_maintenance],
                recommendation="Confirm return-to-service dates or resequence the maintenance plan.",
            )
        )

    if weather.peak_daily_rainfall_mm >= COEFFICIENTS["severe_rain_mm"] * 0.6:
        severity = (
            "critical"
            if weather.peak_daily_rainfall_mm >= COEFFICIENTS["severe_rain_mm"]
            else "warning"
        )
        found.append(
            Bottleneck(
                code="heavy_rain",
                severity=severity,  # type: ignore[arg-type]
                title=f"Heavy rainfall forecast - peak {weather.peak_daily_rainfall_mm} mm/day",
                detail=(
                    f"{weather.heavy_rain_days} day(s) above the {COEFFICIENTS['heavy_rain_mm']} mm "
                    f"threshold in the next {weather.horizon_days} days. Open-pit extraction, "
                    "haul roads and dewatering are all affected."
                ),
                impact_pct=components["weather_component"],
                recommendation=(
                    "Move extraction to covered pits, dewater benches early, and re-sequence "
                    "haulage into the driest windows."
                ),
            )
        )

    soon = int(COEFFICIENTS["maintenance_due_soon_days"])
    due = [
        m for m in machines
        if m.days_until_maintenance is not None and m.days_until_maintenance <= soon
    ]
    overdue = [m for m in machines if (m.days_until_maintenance or 0) < 0]
    if overdue or due:
        parts = []
        if overdue:
            parts.append(f"{len(overdue)} overdue")
        if due:
            parts.append(f"{len(due)} due within {soon} days")
        found.append(
            Bottleneck(
                code="maintenance_due",
                severity="critical" if overdue else "warning",
                title="Maintenance schedule collision",
                detail=(
                    f"{' and '.join(parts)}. Unplanned failures during a peak-rain week compound "
                    "equipment and weather losses."
                ),
                impact_pct=round(components["equipment_component"] * 0.4, 2),
                machines=[m.machine_id for m in (*overdue, *due)][:6],
                recommendation="Bring scheduled services forward and hold critical spares on site.",
            )
        )

    high_risk = [m for m in machines if m.failure_probability >= 0.5 and m.status == "active"]
    if len(high_risk) >= 2:
        found.append(
            Bottleneck(
                code="failure_risk_cluster",
                severity="warning",
                title=f"{len(high_risk)} active machine(s) with elevated failure risk",
                detail=(
                    f"{', '.join(m.machine_id for m in high_risk[:4])} exceed a 0.5 failure "
                    "probability, driven by accumulated hours and maintenance due dates."
                ),
                impact_pct=round(equipment_pressure * COEFFICIENTS["equipment_weight"] * 0.3, 2),
                machines=[m.machine_id for m in high_risk][:6],
                recommendation="Schedule condition-based inspections before the forecast window.",
            )
        )

    order = {"critical": 0, "warning": 1, "info": 2}
    found.sort(key=lambda b: (order[b.severity], -b.impact_pct))
    return found

    score += 0.25 * min(1.0, machines / 15)
    if attainment > 0:
        score += 0.10
    return round(_clamp(score, 0.0, 0.95), 2)


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------
def assess_risk(request: RiskRequest) -> RiskResponse:
    """Run the full Module B assessment."""
    weather_summary, weather_index = aggregate_weather(request.weather, request.horizon_days)
    equipment_summary, equipment_pressure = aggregate_equipment(request.equipment)

    # Baseline: what the mine already misses with no weather or equipment shock.
    base_shortfall = _clamp(100.0 - request.historical_attainment_pct, 0, 100)

    components = score_projection(base_shortfall, weather_index, equipment_pressure, request.scenario)

    bottlenecks = detect_bottlenecks(
        request.equipment, weather_summary, equipment_pressure, components
    )

    # --- Daily projection -------------------------------------------------
    today = datetime.now().astimezone().date()
    # OpenWeatherMap returns non-contiguous 3-hour slots, so build a dense daily
    # series by walking consecutive dates from the start of the forecast. This
    # guarantees no duplicate, out-of-order dates in the chart.
    by_date = {slot.date: slot for slot in request.weather}
    first_date = min(by_date.keys()) if by_date else today
    if first_date < today:
        first_date = today  # never project into the past

    daily: list[DailyProjection] = []
    severe = COEFFICIENTS["severe_rain_mm"]

    for offset in range(request.horizon_days):
        slot_date = first_date + timedelta(days=offset)
        slot = by_date.get(slot_date)
        # Missing days are treated as dry rather than dropped.
        rain = slot.rainfall_mm if slot else 0.0

        # Per-day weather index (not the window aggregate) so the chart varies.
        day_index = _clamp(rain / severe) if severe else 0.0

        day_components = score_projection(
            base_shortfall, day_index, equipment_pressure, request.scenario
        )
        day_shortfall = day_components["projected"]
        projected_tonnes = round(request.daily_target_tonnes * (1 - day_shortfall / 100), 1)

        daily.append(
            DailyProjection(
                date=slot_date,
                target_tonnes=round(request.daily_target_tonnes, 1),
                projected_tonnes=projected_tonnes,
                projected_shortfall_pct=day_shortfall,
                rainfall_mm=round(rain, 1),
                weather_component=day_components["weather_component"],
                equipment_component=day_components["equipment_component"],
            )
        )

    return RiskResponse(
        baseline_shortfall_pct=round(base_shortfall, 2),
        projected_shortfall_pct=components["projected"],
        projected_shortfall_tonnes=round(
            request.daily_target_tonnes * components["projected"] / 100, 1
        ),
        risk_level=risk_level(components["projected"]),  # type: ignore[arg-type]
        confidence_score=_confidence(
            len(request.weather), len(request.equipment), request.historical_attainment_pct
        ),
        weather_index=round(weather_index, 4),
        equipment_pressure=round(equipment_pressure, 4),
        weather_summary=weather_summary,
        equipment_summary=equipment_summary,
        bottlenecks=bottlenecks,
        daily_projection=daily,
        scenario=request.scenario,
        unmitigated_shortfall_pct=components["unmitigated"],
        model_coefficients=ModelCoefficients(
            base_shortfall_pct=round(base_shortfall, 2),
            weather_weight=COEFFICIENTS["weather_weight"],
            equipment_weight=COEFFICIENTS["equipment_weight"],
            labor_relief_pct=COEFFICIENTS["labor_relief_pct"],
            covered_pit_relief=COEFFICIENTS["covered_pit_relief"],
            maintenance_relief_factor=COEFFICIENTS["maintenance_relief_factor"],
            fleet_surge_relief_pct=COEFFICIENTS["fleet_surge_relief_pct"],
            severe_rain_mm=COEFFICIENTS["severe_rain_mm"],
            heavy_rain_mm=COEFFICIENTS["heavy_rain_mm"],
            maintenance_due_soon_days=int(COEFFICIENTS["maintenance_due_soon_days"]),
        ),
        generated_at=datetime.now(timezone.utc),
    )

