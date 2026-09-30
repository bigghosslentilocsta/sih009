/**
 * Weather proxy route.
 * Keeps the weather API key on the server so it is never shipped to the browser.
 */

import axios from 'axios';
import { Router } from 'express';

import { env } from '../config/env.js';

const router = Router();

const client = axios.create({
  baseURL: env.weather.baseUrl,
  timeout: 10_000,
});

/**
 * GET /api/v1/weather?lat=22.35&lon=86.35
 * Proxies OpenWeatherMap current conditions.
 */
router.get('/', async (req, res, next) => {
  const { lat, lon } = req.query;

  if (lat === undefined || lon === undefined) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Both `lat` and `lon` query parameters are required.',
    });
  }

  try {
    const { data } = await client.get('/weather', {
      params: { lat, lon, appid: env.weather.apiKey, units: 'metric' },
    });
    return res.json({
      location: data.name,
      coordinates: data.coord,
      temperature: data.main?.temp,
      feelsLike: data.main?.feels_like,
      humidity: data.main?.humidity,
      pressure: data.main?.pressure,
      windSpeed: data.wind?.speed,
      weather: data.weather?.[0]?.description,
      observedAt: data.dt,
    });
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json({
        error: 'UpstreamError',
        message: err.response.data?.message ?? 'Weather provider rejected the request.',
      });
    }
    return next(err);
  }
});

export default router;
