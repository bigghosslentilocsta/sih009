import { Router } from 'express';

import { dbStatus } from '../config/db.js';

const router = Router();

const startedAt = Date.now();

/** Lightweight liveness probe - no database round-trip. */
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  });
});

/** Readiness probe - verifies the database is actually usable. */
router.get('/ready', async (req, res) => {
  const database = dbStatus();
  const ready = database.state === 'connected';
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'degraded', database });
});

export default router;
