/**
 * Module A - geospatial exploration (proxied to the Python ai-service).
 *
 *   POST /api/v1/exploration/analyze  analyse a GeoJSON polygon
 *
 * Access is restricted to geologists and administrators; the backend validates
 * the request and forwards it to FastAPI, which does the Earth Engine work.
 */

import { Router } from 'express';

import { ROLES } from '../config/roles.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { analyzeZone } from '../services/aiClient.js';

const router = Router();

// Geologist-only analysis; admins can also inspect zones.
router.post(
  '/analyze',
  authenticate,
  authorize(ROLES.GEOLOGIST, ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const { name, geometry, gridResolution, includeHeatmap } = req.body ?? {};

    const problems = validateAnalyzeRequest({ name, geometry, gridResolution });
    if (problems.length > 0) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Validation failed.',
        details: Object.fromEntries(problems.map((p) => [p.field, p.message])),
      });
    }

    const startedAt = Date.now();
    const result = await analyzeZone({
      name: name.trim(),
      geometry,
      gridResolution,
      includeHeatmap: includeHeatmap !== false,
    });

    console.log(
      `[exploration] user=${req.user.email} role=${req.user.role} zone=${result.zone_id} ` +
        `score=${result.suitability_score} source=${result.data_source} ` +
        `ms=${Date.now() - startedAt}`,
    );

    return res.json({
      ...result,
      // Who ran this analysis - the starting point of an audit trail.
      analyzedBy: {
        id: req.user.id,
        name: req.user.fullName,
        email: req.user.email,
        role: req.user.role,
      },
    });
  }),
);

/** Cheap structural checks - the ai-service does the authoritative geometry work. */
function validateAnalyzeRequest({ name, geometry, gridResolution }) {
  const problems = [];

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    problems.push({ field: 'name', message: 'Zone name must be at least 2 characters.' });
  } else if (name.length > 120) {
    problems.push({ field: 'name', message: 'Zone name must be at most 120 characters.' });
  }

  if (!geometry || typeof geometry !== 'object') {
    problems.push({ field: 'geometry', message: 'A GeoJSON geometry is required.' });
  } else {
    const type = geometry.type ?? geometry.geometry?.type;
    if (type !== 'Polygon') {
      problems.push({ field: 'geometry', message: "Only GeoJSON 'Polygon' geometries are supported." });
    } else {
      const coords = geometry.coordinates ?? geometry.geometry?.coordinates;
      if (!Array.isArray(coords) || !Array.isArray(coords[0]) || coords[0].length < 4) {
        problems.push({
          field: 'geometry',
          message: 'A polygon ring needs at least 4 [lng, lat] positions.',
        });
      }
    }
  }

  if (gridResolution !== undefined) {
    const value = Number(gridResolution);
    if (!Number.isInteger(value) || value < 4 || value > 40) {
      problems.push({ field: 'gridResolution', message: 'gridResolution must be an integer 4-40.' });
    }
  }

  return problems;
}

export default router;
