/** Module B - operations API client + a client-side mirror of the risk model. */

import api from './apiClient.js';

export const getForecast = (params = {}) => api.get('/operations/forecast', { params });
export const getEquipment = (params = {}) => api.get('/operations/equipment', { params });
export const getShifts = (params = {}) => api.get('/operations/shifts', { params });

/** Re-score server-side with a mitigation scenario applied. */
export const applyScenario = (scenario, params = {}) =>
  api.post('/operations/forecast', { scenario, ...params });

export const RISK_COLORS = {
  low: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Low risk' },
  moderate: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'Moderate risk' },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', label: 'High risk' },
  critical: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', label: 'Critical risk' },
};

export const STATUS_COLORS = {
  active: '#16a34a',
  maintenance: '#f59e0b',
  down: '#dc2626',
};

const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

/**
 * Client-side mirror of the ai-service projection formula.
 *
 * The weights all come from `risk.model_coefficients` in the API response -
 * nothing is hard-coded here, so the simulator cannot drift from the service.
 * This is what lets the sliders recompute instantly instead of issuing a
 * request per drag.
 */
export function projectShortfall(coefficients, { weatherIndex, equipmentPressure, scenario }) {
  if (!coefficients) return null;

  const weatherComponent =
    coefficients.weather_weight *
    weatherIndex *
    (1 - coefficients.covered_pit_relief * scenario.covered_pit_fraction);

  const equipmentComponent =
    coefficients.equipment_weight *
    equipmentPressure *
    (1 - coefficients.maintenance_relief_factor * scenario.maintenance_acceleration);

  const laborRelief = coefficients.labor_relief_pct * scenario.labor_shift_fraction;
  const surgeRelief = coefficients.fleet_surge_relief_pct * scenario.fleet_surge_fraction;

  const unmitigated = clamp(coefficients.base_shortfall_pct + weatherComponent + equipmentComponent);
  const projected = clamp(unmitigated - laborRelief - surgeRelief);

  return {
    weatherComponent,
    equipmentComponent,
    laborRelief,
    surgeRelief,
    unmitigated,
    projected,
    improvement: unmitigated - projected,
  };
}

/**
 * Re-project the daily series under a scenario, using the same formula.
 *
 * The per-day weather index is derived from `rainfall_mm / severe_rain_mm`
 * rather than recovered by inverting the returned component. That keeps the
 * maths exact and independent of which scenario produced the base response.
 *
 * @param {Array} daily - `risk.daily_projection` from the API
 */
export function projectDaily(daily, coefficients, { equipmentPressure, scenario }) {
  if (!daily?.length || !coefficients) return [];

  const weatherFactor = 1 - coefficients.covered_pit_relief * scenario.covered_pit_fraction;
  const relief =
    coefficients.labor_relief_pct * scenario.labor_shift_fraction +
    coefficients.fleet_surge_relief_pct * scenario.fleet_surge_fraction;

  const equipmentComponent =
    coefficients.equipment_weight *
    equipmentPressure *
    (1 - coefficients.maintenance_relief_factor * scenario.maintenance_acceleration);

  return daily.map((day) => {
    const dayIndex = clamp((day.rainfall_mm ?? 0) / coefficients.severe_rain_mm, 0, 1);
    const weatherComponent = coefficients.weather_weight * dayIndex * weatherFactor;

    const unmitigated = clamp(coefficients.base_shortfall_pct + weatherComponent + equipmentComponent);
    const projected = clamp(unmitigated - relief);

    return {
      ...day,
      projected_shortfall_pct: projected,
      projected_tonnes: Math.round(day.target_tonnes * (1 - projected / 100)),
    };
  });
}

export const EMPTY_SCENARIO = {
  covered_pit_fraction: 0,
  labor_shift_fraction: 0,
  maintenance_acceleration: 0,
  fleet_surge_fraction: 0,
};
