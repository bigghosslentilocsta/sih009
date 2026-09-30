/**
 * Express application wiring for SIH 26009.
 * Kept separate from `server.js` so the app can be imported by tests.
 */

import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env.js';
import adminRoutes from './routes/admin.routes.js';
import authRoutes from './routes/auth.routes.js';
import explorationRoutes from './routes/exploration.routes.js';
import executiveRoutes from './routes/executive.routes.js';
import healthRoutes from './routes/health.routes.js';
import indexRoutes from './routes/index.routes.js';
import operationsRoutes from './routes/operations.routes.js';
import weatherRoutes from './routes/weather.routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  // --- Security & parsing ---
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin(origin, callback) {
        // Allow server-to-server / curl requests (no Origin header).
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));

  // --- Rate limiting ---
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // --- Routes ---
  app.get('/', (req, res) => res.redirect(`${env.apiPrefix}/health`));
  app.use(env.apiPrefix, indexRoutes);
  app.use(`${env.apiPrefix}/health`, healthRoutes);
  app.use(`${env.apiPrefix}/weather`, weatherRoutes);
  app.use(`${env.apiPrefix}/exploration`, explorationRoutes);

  // Auth & admin are mounted at /api/... per the platform spec, and mirrored
  // under the versioned prefix so both contracts resolve to the same router.
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use(`${env.apiPrefix}/auth`, authRoutes);
  app.use(`${env.apiPrefix}/admin`, adminRoutes);

  // Exploration is mounted at the spec path and mirrored at the unversioned
  // path, so the frontend can use one consistent base for every API call.
  app.use(`${env.apiPrefix}/exploration`, explorationRoutes);
  app.use('/api/exploration', explorationRoutes);

  // Module B operations, mirrored for the same reason.
  app.use(`${env.apiPrefix}/operations`, operationsRoutes);
  app.use('/api/operations', operationsRoutes);

  // Module C executive summary.
  app.use(`${env.apiPrefix}/executive`, executiveRoutes);
  app.use('/api/executive', executiveRoutes);

  // --- 404 ---
  app.use((req, res) => {
    res.status(404).json({ error: 'NotFound', message: `Cannot ${req.method} ${req.originalUrl}` });
  });

  // --- Centralised error handler ---
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    // Mongo duplicate key -> surface as a conflict, not a 500.
    if (err?.code === 11000) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A record with those unique values already exists.',
      });
    }

    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error('[error]', err);

    return res.status(status).json({
      error: err.name || 'InternalServerError',
      message: status >= 500 && env.isProduction ? 'Something went wrong' : err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  });

  return app;
}
