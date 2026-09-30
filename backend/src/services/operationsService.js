/**
 * Module B aggregation.
 *
 * Pulls fleet condition (EquipmentLog) and production history (ShiftTarget)
 * from MongoDB, combines them with the weather forecast, and hands the result
 * to the Python risk service.
 */

import EquipmentLog from '../models/EquipmentLog.model.js';
import ShiftTarget from '../models/ShiftTarget.model.js';
import { getForecast } from './weatherService.js';
import { aiRiskAssessment } from './aiClient.js';

/** Fleet state, shaped for the AI service. */
export async function getFleetState() {
  const machines = await EquipmentLog.find().sort({ machine_id: 1 });

  return machines.map((m) => ({
    machine_id: m.machine_id,
    name: m.name,
    type: m.type,
    status: m.status,
    sector: m.sector,
    hours_active: m.hours_active,
    downtime_hours: m.downtime_hours,
    days_until_maintenance: m.days_until_maintenance,
    failure_probability: m.failure_probability ?? m.deriveFailureProbability(),
    notes: m.notes,
  }));
}

/** Recent attainment + mean daily target, from the shift history. */
export async function getPerformanceSummary({ days = 56, sector } = {}) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);

  const query = { date: { $gte: since } };
  if (sector) query.sector = sector;

  const shifts = await ShiftTarget.find(query).sort({ date: 1 });

  const target = shifts.reduce((sum, s) => sum + s.target_tonnes, 0);
  const actual = shifts.reduce((sum, s) => sum + (s.actual_tonnes ?? 0), 0);

  return {
    shifts,
    attainment_pct: target > 0 ? Math.round((actual / target) * 1000) / 10 : 0,
    mean_daily_target: shifts.length > 0 ? Math.round(target / shifts.length) : 0,
    total_target: target,
    total_actual: actual,
    record_count: shifts.length,
  };
}

/** Daily totals across all sectors, for the trend chart. */
export function toDailySeries(shifts) {
  /** @type {Map<string, {date: string, target: number, actual: number}>} */
  const byDate = new Map();

  for (const s of shifts) {
    const key = s.date.toISOString().slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, { date: key, target: 0, actual: 0 });
    const entry = byDate.get(key);
    entry.target += s.target_tonnes;
    entry.actual += s.actual_tonnes ?? 0;
  }

  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      ...d,
      attainment: d.target > 0 ? Math.round((d.actual / d.target) * 1000) / 10 : null,
    }));
}

/**
 * Build the complete operations forecast: weather + fleet + performance, scored
 * by the AI service.
 */
export async function buildForecast({ horizonDays = 7, scenario, sector, historyDays = 56 } = {}) {
  const [forecast, equipment, performance] = await Promise.all([
    getForecast({ horizonDays }),
    getFleetState(),
    getPerformanceSummary({ days: historyDays, sector }),
  ]);

  const risk = await aiRiskAssessment({
    weather: forecast.days,
    equipment,
    historical_attainment_pct: performance.attainment_pct,
    daily_target_tonnes: performance.mean_daily_target || 900,
    horizon_days: horizonDays,
    scenario: scenario ?? {},
  });

  return {
    generated_at: new Date().toISOString(),
    weather: {
      source: forecast.source,
      location: forecast.location,
      error: forecast.error ?? null,
      days: forecast.days,
    },
    performance: {
      attainment_pct: performance.attainment_pct,
      mean_daily_target: performance.mean_daily_target,
      record_count: performance.record_count,
      daily: toDailySeries(performance.shifts),
    },
    equipment,
    risk,
  };
}
