/**
 * Module C - executive aggregation.
 *
 * Rolls up macro metrics across the whole platform:
 *   - reserve inventory   (ReserveBlock)
 *   - operational health (EquipmentLog)
 *   - production         (ShiftTarget, bucketed by month)
 *   - forward risk/alerts (the Module B forecast)
 *
 * Every figure is derived from database records - nothing is hard-coded.
 */

import EquipmentLog from '../models/EquipmentLog.model.js';
import ReserveBlock from '../models/ReserveBlock.model.js';
import ShiftTarget from '../models/ShiftTarget.model.js';
import { buildForecast } from './operationsService.js';

const MAINTENANCE_DUE_SOON_DAYS = 7;

const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

// ---------------------------------------------------------------------------
// Reserve inventory
// ---------------------------------------------------------------------------
export async function getReserveInventory() {
  const blocks = await ReserveBlock.find().sort({ estimated_reserve_tonnes: -1 });

  const totalReserve = blocks.reduce((s, b) => s + b.estimated_reserve_tonnes, 0);
  const totalMetal = blocks.reduce((s, b) => s + b.contained_metal_tonnes, 0);
  const totalArea = blocks.reduce((s, b) => s + b.area_km2, 0);

  const byStatus = blocks.reduce((acc, b) => {
    acc[b.status] = (acc[b.status] ?? 0) + 1;
    return acc;
  }, {});

  // Grade weighted by reserve size, not a flat mean.
  const weightedGrade =
    totalReserve > 0
      ? blocks.reduce((s, b) => s + b.average_grade_pct * b.estimated_reserve_tonnes, 0) / totalReserve
      : 0;

  const analysed = blocks.filter((b) => b.suitability_score !== null);
  const meanSuitability =
    analysed.length > 0
      ? analysed.reduce((s, b) => s + b.suitability_score, 0) / analysed.length
      : null;

  return {
    total_blocks: blocks.length,
    active_blocks: blocks.filter((b) => b.status !== 'prospective').length,
    total_reserve_tonnes: totalReserve,
    total_contained_metal_tonnes: totalMetal,
    total_reserve_mt: round(totalReserve / 1e6, 2),
    total_area_km2: round(totalArea, 1),
    weighted_average_grade_pct: round(weightedGrade, 2),
    mean_suitability_score: meanSuitability === null ? null : round(meanSuitability, 1),
    by_status: byStatus,
    // Provenance is surfaced so seeded figures are never mistaken for surveys.
    provenance: blocks.reduce((acc, b) => {
      acc[b.source] = (acc[b.source] ?? 0) + 1;
      return acc;
    }, {}),
    blocks: blocks.map((b) => ({
      id: b.id,
      block_id: b.block_id,
      name: b.name,
      state: b.state,
      district: b.district,
      area_km2: b.area_km2,
      estimated_reserve_tonnes: b.estimated_reserve_tonnes,
      contained_metal_tonnes: b.contained_metal_tonnes,
      average_grade_pct: b.average_grade_pct,
      confidence_level: b.confidence_level,
      status: b.status,
      source: b.source,
      suitability_score: b.suitability_score,
    })),
  };
}

// ---------------------------------------------------------------------------
// Operational health
// ---------------------------------------------------------------------------
export async function getOperationalHealth() {
  const machines = await EquipmentLog.find();

  if (machines.length === 0) {
    return {
      health_score: 0,
      grade: 'unknown',
      availability_pct: 0,
      total_machines: 0,
      components: { availability: 0, reliability: 0, maintenance: 0 },
    };
  }

  const total = machines.length;
  const active = machines.filter((m) => m.status === 'active').length;
  const availability = (active / total) * 100;

  const meanFailure =
    machines.reduce((s, m) => s + (m.failure_probability ?? 0), 0) / total;
  const reliability = Math.max(0, 100 - meanFailure * 100);

  const overdue = machines.filter(
    (m) => (m.days_until_maintenance ?? 0) < 0,
  ).length;
  const maintenance = Math.max(0, 100 - (overdue / total) * 100);

  // Weighted blend - availability dominates, because an idle machine is a
  // bigger production problem than a late service.
  const healthScore = availability * 0.5 + reliability * 0.3 + maintenance * 0.2;

  const grade =
    healthScore >= 85 ? 'A' : healthScore >= 70 ? 'B' : healthScore >= 55 ? 'C' : 'D';

  return {
    health_score: round(healthScore, 1),
    grade,
    availability_pct: round(availability, 1),
    reliability_pct: round(reliability, 1),
    maintenance_compliance_pct: round(maintenance, 1),
    total_machines: total,
    active,
    in_maintenance: machines.filter((m) => m.status === 'maintenance').length,
    down: machines.filter((m) => m.status === 'down').length,
    overdue_maintenance: overdue,
    due_soon: machines.filter((m) => {
      const d = m.days_until_maintenance;
      return d !== null && d >= 0 && d <= MAINTENANCE_DUE_SOON_DAYS;
    }).length,
    components: {
      availability: round(availability, 1),
      reliability: round(reliability, 1),
      maintenance: round(maintenance, 1),
    },
  };
}

// ---------------------------------------------------------------------------
// Production, bucketed by month
// ---------------------------------------------------------------------------
export async function getMonthlyProduction({ months = 12 } = {}) {
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - (months - 1), 1);
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(1);

  const shifts = await ShiftTarget.find({ date: { $gte: since } }).sort({ date: 1 });

  /** @type {Map<string, any>} */
  const buckets = new Map();
  for (const s of shifts) {
    const key = `${s.date.getUTCFullYear()}-${String(s.date.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!buckets.has(key)) {
      buckets.set(key, { month: key, target: 0, actual: 0, records: 0, rainy_days: 0 });
    }
    const b = buckets.get(key);
    b.target += s.target_tonnes;
    b.actual += s.actual_tonnes ?? 0;
    b.records += 1;
    if ((s.rainfall_mm ?? 0) >= 7.5) b.rainy_days += 1;
  }

  const series = [...buckets.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((b) => ({
      month: b.month,
      target_tonnes: b.target,
      actual_tonnes: b.actual,
      fulfillment_pct: b.target > 0 ? round((b.actual / b.target) * 100, 1) : null,
      shortfall_tonnes: round(b.target - b.actual, 0),
      records: b.records,
      rainy_days: b.rainy_days,
    }));

  const totalTarget = series.reduce((s, m) => s + m.target_tonnes, 0);
  const totalActual = series.reduce((s, m) => s + m.actual_tonnes, 0);

  // Current month is partial - fulfilment will look artificially low.
  const currentMonth = new Date().toISOString().slice(0, 7);
  const latest = series.at(-1) ?? null;
  const previous = series.at(-2) ?? null;

  return {
    series,
    total_target_tonnes: totalTarget,
    total_actual_tonnes: totalActual,
    overall_fulfillment_pct: totalTarget > 0 ? round((totalActual / totalTarget) * 100, 1) : null,
    current_month: currentMonth,
    current_month_fulfillment_pct: latest?.fulfillment_pct ?? null,
    previous_month_fulfillment_pct: previous?.fulfillment_pct ?? null,
    // Null when there is no prior month to compare against.
    fulfilment_trend_pp:
      latest?.fulfillment_pct != null && previous?.fulfillment_pct != null
        ? round(latest.fulfillment_pct - previous.fulfillment_pct, 1)
        : null,
    is_partial_month: latest?.month === currentMonth,
  };
}

// ---------------------------------------------------------------------------
// Composite summary
// ---------------------------------------------------------------------------
export async function getExecutiveSummary({ horizonDays = 7 } = {}) {
  const [reserves, health, production] = await Promise.all([
    getReserveInventory(),
    getOperationalHealth(),
    getMonthlyProduction(),
  ]);

  // Forward risk comes from the same Module B forecast the ops team sees, so
  // the executive and operational views can never disagree.
  let risk = null;
  try {
    const forecast = await buildForecast({ horizonDays });
    risk = {
      projected_shortfall_pct: forecast.risk.projected_shortfall_pct,
      unmitigated_shortfall_pct: forecast.risk.unmitigated_shortfall_pct,
      risk_level: forecast.risk.risk_level,
      confidence_score: forecast.risk.confidence_score,
      weather_index: forecast.risk.weather_index,
      equipment_pressure: forecast.risk.equipment_pressure,
      weather_source: forecast.weather.source,
      weather_location: forecast.weather.location?.name ?? null,
      bottlenecks: forecast.risk.bottlenecks,
    };
  } catch (err) {
    // The executive view must still render if the AI service is down.
    console.warn('[executive] risk assessment unavailable:', err.message);
    risk = { unavailable: true, error: err.message };
  }

  const alerts = [
    ...(risk?.bottlenecks ?? []).map((b) => ({
      source: 'operations',
      severity: b.severity,
      title: b.title,
      detail: b.detail,
      impact_pct: b.impact_pct,
      machines: b.machines,
      recommendation: b.recommendation,
    })),
    ...(health.overdue_maintenance > 0
      ? [
          {
            source: 'maintenance',
            severity: 'warning',
            title: `${health.overdue_maintenance} machine(s) overdue for maintenance`,
            detail: 'Overdue servicing erodes fleet reliability and raises breakdown risk.',
            impact_pct: null,
            machines: [],
            recommendation: 'Bring overdue services forward this week.',
          },
        ]
      : []),
  ];

  return {
    generated_at: new Date().toISOString(),
    reserves,
    operations: health,
    production,
    risk,
    alerts,
    // Convenience headline for the UI.
    headline: {
      active_reserve_blocks: reserves.active_blocks,
      total_reserve_mt: reserves.total_reserve_mt,
      health_score: health.health_score,
      health_grade: health.grade,
      fulfilment_pct: production.current_month_fulfillment_pct,
      projected_shortfall_pct: risk?.projected_shortfall_pct ?? null,
      open_alerts: alerts.length,
    },
  };
}
