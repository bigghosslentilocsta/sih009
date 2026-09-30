/**
 * Server entrypoint: boot the app, connect to MongoDB, handle shutdown.
 */

import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { env } from './config/env.js';
import { seedAdmin } from '../seed.js';
import { seedOperations } from '../seedOperations.js';

async function start() {
  const app = createApp();

  try {
    await connectDB();
    // Idempotent - creates the default admin only when none exists.
    await seedAdmin();
    // Idempotent - populates the Module B fleet and shift history.
    await seedOperations();
  } catch (err) {
    console.error('[server] Failed to connect to MongoDB:', err.message);
    console.error('[server] Starting anyway - database-backed routes will fail.');
  }

  const server = app.listen(env.port, () => {
    console.log(`[server] SIH 26009 API listening on http://localhost:${env.port}`);
    console.log(`[server] Environment: ${env.nodeEnv}`);
    console.log(`[server] AI service:  ${env.aiServiceUrl}`);
  });

  const shutdown = (signal) => async () => {
    console.log(`\n[server] ${signal} received, shutting down...`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown('SIGINT'));
  process.on('SIGTERM', shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    console.error('[server] Unhandled rejection:', reason);
  });
}

start();
