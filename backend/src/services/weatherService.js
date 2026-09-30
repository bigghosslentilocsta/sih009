/**
 * OpenWeatherMap integration for Module B.
 *
 * The key never leaves the server. The 5-day / 3-hour forecast is aggregated
 * into daily rainfall totals, because the risk model reasons in mm/day.
 *
 * If the provider is unreachable or the key is invalid we fall back to a
 * deterministic synthetic forecast so the dashboard still renders - always
 * flagged via `source` so the UI can say so.
 */

import axios from 'axios';

import { env } from '../config/env.js';
import { makeRng, round } from '../utils/random.js';

/** Balaghat, Madhya Pradesh - the reference mine for the platform. */
export const MINE_LOCATION = {
  name: 'Balaghat',
  state: 'Madhya Pradesh',
  lat: 22.2456,
  lon: 79.8815,
};

const client = axios.create({
  baseURL: env.weather.baseUrl,
  timeout: 10_000,
});

/**
 * Convert the 3-hourly forecast into one entry per local day.
 * @returns {Array<{date: string, rainfall_mm: number, temp_c: number,
 *                  wind_speed_ms: number, humidity_pct: number, description: string}>}
 */
function aggregateByDay(list) {
  /** @type {Map<string, any>} */
  const days = new Map();

  for (const entry of list) {
    const dt = new Date(entry.dt * 1000);
    const key = dt.toISOString().slice(0, 10);

    if (!days.has(key)) {
      days.set(key, {
        date: key,
        rainfall_mm: 0,
        temp_c: null,
        wind_speed_ms: null,
        humidity_pct: null,
        description: '',
      });
    }

    const day = days.get(key);
    // `rain` is absent on dry slots in the OpenWeather payload.
    day.rainfall_mm += entry.rain?.['3h'] ?? 0;
    day.temp_c = entry.main?.temp ?? day.temp_c;
    day.wind_speed_ms = entry.wind?.speed ?? day.wind_speed_ms;
    day.humidity_pct = entry.main?.humidity ?? day.humidity_pct;
    if (!day.description && entry.weather?.[0]?.description) {
      day.description = entry.weather[0].description;
    }
  }

  return [...days.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ ...d, rainfall_mm: round(d.rainfall_mm, 1) }));
}

/**
 * Deterministic stand-in forecast so the UI works without a valid API key.
 * Seeded by the date, so it is stable within a day but varies across days.
 */
function syntheticForecast(horizonDays = 7) {
  const rng = makeRng(Math.floor(Date.now() / 86_400_000));
  const days = [];
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);

  for (let i = 0; i < horizonDays; i += 1) {
    const roll = rng();
    const rainfall = roll > 0.72 ? round(6 + rng() * 42, 1) : round(rng() * 5, 1);
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    days.push({
      date: d.toISOString().slice(0, 10),
      rainfall_mm: rainfall,
      temp_c: round(24 + rng() * 8, 1),
      wind_speed_ms: round(1 + rng() * 6, 1),
      humidity_pct: Math.round(45 + rng() * 45),
      description: rainfall >= 7.5 ? 'moderate rain' : rainfall >= 0.2 ? 'light rain' : 'clear sky',
    });
  }
  return days;
}

/**
 * Fetch the forecast. Never throws.
 * @returns {Promise<{source: string, location: object, days: Array<object>, error?: string}>}
 */
export async function getForecast({ lat = MINE_LOCATION.lat, lon = MINE_LOCATION.lon, horizonDays = 7 } = {}) {
  try {
    const { data } = await client.get('/forecast', {
      params: { lat, lon, appid: env.weather.apiKey, units: 'metric' },
    });

    const days = aggregateByDay(data.list ?? []).slice(0, horizonDays);
    if (days.length === 0) throw new Error('Forecast returned no usable slots.');

    return {
      source: 'openweathermap',
      location: { name: data.city?.name ?? MINE_LOCATION.name, lat, lon },
      days,
    };
  } catch (err) {
    const reason =
      err.response?.data?.message ?? err.code ?? err.message ?? 'Unknown weather provider error';
    console.warn(`[weather] falling back to a synthetic forecast: ${reason}`);

    return {
      source: 'synthetic',
      location: { name: MINE_LOCATION.name, lat, lon },
      days: syntheticForecast(horizonDays),
      error: String(reason).slice(0, 200),
    };
  }
}
