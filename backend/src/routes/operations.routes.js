/**
 * Module B - operations management (operations_manager / admin).
 *
 *   GET  /api/v1/operations/forecast   weather + fleet + history + AI risk
 *   POST /api/v1/operations/forecast   same, with a mitigation scenario applied
 *   GET  /api/v1/operations/equipment  fleet state
 *   GET  /api/v1/operations/shifts     production history for the charts
 */

import { Router } from 'express';

import { SECTOR_IDS } from '../config/operations.js';
import { ROLES } from '../config/roles.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  buildForecast,
  getFleetState,
  getPerformanceSummary,
  toDailySeries,
} from '../services/operationsService.js';
import EquipmentLog from '../models/EquipmentLog.model.js';
import ShiftTarget from '../models/ShiftTarget.model.js';

const router = Router();

// Module B is operations + admin only.
router.use(authenticate, authorize(ROLES.OPERATIONS_MANAGER, ROLES.ADMIN));

const parseHorizon = (value) => {
  const n = Number(value ?? 7);
  return Number.isInteger(n) && n >= 1 && n <= 16 ? n : 7;
};

const parseHistoryDays = (value) => {
  const n = Number(value ?? 56);
  return Number.isInteger(n) && n >= 7 && n <= 365 ? n : 56;
};

const parseSector = (value) =>
  SECTOR_IDS.includes(value) ? value : undefined;

/** GET /api/v1/operations/forecast */
router.get(
  '/forecast',
  asyncHandler(async (req, res) => {
    const payload = await buildForecast({
      horizonDays: parseHorizon(req.query.horizon_days),
      sector: parseSector(req.query.sector),
      historyDays: parseHistoryDays(req.query.history_days),
    });
    res.json(payload);
  }),
);

/**
 * POST /api/v1/operations/forecast
 * Re-scores with a mitigation scenario. The dashboard's sliders recompute
 * locally from `risk.model_coefficients`; this is for persisting/confirming
 * a chosen scenario.
 */
router.post(
  '/forecast',
  asyncHandler(async (req, res) => {
    const { scenario = {}, horizon_days, sector } = req.body ?? {};

    const payload = await buildForecast({
      horizonDays: parseHorizon(horizon_days),
      scenario,
      sector: parseSector(sector),
    });

    res.json({
      ...payload,
      applied_scenario: scenario,
      // Who ran the scenario - the starting point of an audit trail.
      requested_by: {
        id: req.user.id,
        name: req.user.fullName,
        email: req.user.email,
        role: req.user.role,
      },
    });
  }),
);

/** GET /api/v1/operations/equipment */
router.get(
  '/equipment',
  asyncHandler(async (req, res) => {
    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.type) query.type = req.query.type;
    if (req.query.sector) query.sector = req.query.sector;

    const machines = await EquipmentLog.find(query).sort({ machine_id: 1 });
    const state = await getFleetState();

    res.json({
      total: machines.length,
      machines: state,
      by_status: machines.reduce((acc, m) => {
        acc[m.status] = (acc[m.status] ?? 0) + 1;
        return acc;
      }, {}),
      by_type: machines.reduce((acc, m) => {
        acc[m.type] = (acc[m.type] ?? 0) + 1;
        return acc;
      }, {}),
    });
  }),
);

/** GET /api/v1/operations/shifts?days=56&sector=SECTOR_A */
router.get(
  '/shifts',
  asyncHandler(async (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days ?? 56), 1), 365);
    const performance = await getPerformanceSummary({
      days,
      sector: parseSector(req.query.sector),
    });

    res.json({
      attainment_pct: performance.attainment_pct,
      mean_daily_target: performance.mean_daily_target,
      total_target: performance.total_target,
      total_actual: performance.total_actual,
      record_count: performance.record_count,
      daily: toDailySeries(performance.shifts),
      records: performance.shifts.map((s) => s.toJSON()),
    });
  }),
);

export default router;
