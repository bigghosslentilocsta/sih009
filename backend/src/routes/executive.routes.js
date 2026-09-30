/**
 * Module C - executive summary and report export (executive / admin only).
 *
 *   GET /api/v1/executive/summary  macro KPIs, trends and open alerts
 *   GET /api/v1/executive/export   the same insights as a downloadable CSV
 */

import { Router } from 'express';

import { ROLES } from '../config/roles.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getExecutiveSummary } from '../services/executiveService.js';
import { buildExecutiveCsv, csvFilename } from '../services/csvService.js';

const router = Router();

// Module C is executive + admin only.
router.use(authenticate, authorize(ROLES.EXECUTIVE, ROLES.ADMIN));

const parseHorizon = (value) => {
  const n = Number(value ?? 7);
  return Number.isInteger(n) && n >= 1 && n <= 16 ? n : 7;
};

/** GET /api/v1/executive/summary */
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const summary = await getExecutiveSummary({ horizonDays: parseHorizon(req.query.horizon_days) });
    res.json(summary);
  }),
);

/**
 * GET /api/v1/executive/export
 * Returns a CSV attachment. `?format=json` returns the payload instead, which
 * is handy for tooling.
 */
router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const summary = await getExecutiveSummary({ horizonDays: parseHorizon(req.query.horizon_days) });
    const csv = buildExecutiveCsv(summary);

    if (req.query.format === 'json') {
      return res.json({ filename: csvFilename(), csv });
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${csvFilename()}"`);
    // Stop Excel from mangling UTF-8 (₹, ², en-dashes).
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(`\uFEFF${csv}`);
  }),
);

export default router;
