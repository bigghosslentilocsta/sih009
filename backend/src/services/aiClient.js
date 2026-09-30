/**
 * Thin HTTP client for the Python ai-service (FastAPI).
 *
 * The backend never talks to Earth Engine directly - all geospatial work is
 * delegated here. Keeping the call in one place means timeouts, error
 * translation and (later) caching live in a single file.
 */

import axios from 'axios';

import { env } from '../config/env.js';

const client = axios.create({
  baseURL: env.aiServiceUrl,
  timeout: 120_000, // GEE composite + reduceRegions can take ~30-60s
  headers: { 'Content-Type': 'application/json' },
});

/** Translate a FastAPI/HTTP failure into a message safe to return to a client. */
function translateError(err) {
  const status = err.response?.status;
  const detail = err.response?.data?.detail;

  if (err.code === 'ECONNABORTED') {
    const e = new Error('The analysis service timed out. Try a smaller area or fewer cells.');
    e.status = 504;
    return e;
  }
  if (!err.response) {
    const e = new Error(`Cannot reach the analysis service at ${env.aiServiceUrl}.`);
    e.status = 503;
    return e;
  }
  if (status === 422) {
    const e = new Error(typeof detail === 'string' ? detail : 'Invalid zone geometry.');
    e.status = 422;
    return e;
  }

  const e = new Error(
    typeof detail === 'string' ? detail : 'Zone analysis failed. Please try again.',
  );
  e.status = status >= 500 ? 502 : status;
  return e;
}

/**
 * Analyse a GeoJSON polygon for manganese suitability.
 * @param {{name: string, geometry: object, gridResolution?: number}} params
 * @returns {Promise<object>} the ZoneAnalysisResponse payload
 */
export async function analyzeZone({ name, geometry, gridResolution = 12, includeHeatmap = true }) {
  try {
    const { data } = await client.post('/api/v1/analyze-zone', {
      name,
      geometry,
      grid_resolution: gridResolution,
      include_heatmap: includeHeatmap,
    });
    return data;
  } catch (err) {
    throw translateError(err);
  }
}

/**
 * Score a production-shortfall risk window.
 * @param {object} params
 * @returns {Promise<object>} the RiskResponse payload
 */
export async function aiRiskAssessment({
  weather = [],
  equipment = [],
  historicalAttainmentPct = 92,
  dailyTargetTonnes = 900,
  horizonDays = 7,
  scenario = {},
}) {
  try {
    const { data } = await client.post('/api/v1/operations/risk', {
      weather,
      equipment,
      historical_attainment_pct: historicalAttainmentPct,
      daily_target_tonnes: dailyTargetTonnes,
      horizon_days: horizonDays,
      scenario: {
        covered_pit_fraction: scenario.covered_pit_fraction ?? 0,
        labor_shift_fraction: scenario.labor_shift_fraction ?? 0,
        maintenance_acceleration: scenario.maintenance_acceleration ?? 0,
        fleet_surge_fraction: scenario.fleet_surge_fraction ?? 0,
      },
    });
    return data;
  } catch (err) {
    throw translateError(err);
  }
}

export default client;
