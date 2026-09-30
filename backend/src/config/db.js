/**
 * MongoDB connection management (Mongoose).
 */

import mongoose from 'mongoose';

import { env } from './env.js';

mongoose.set('strictQuery', true);

let connection = null;

/**
 * Connect to MongoDB with retry/backoff so the API survives a slow or
 * not-yet-running database (common with docker-compose boot ordering).
 */
export async function connectDB({ retries = 5, delayMs = 2000 } = {}) {
  if (connection) return connection;

  mongoose.connection.on('connected', () => {
    console.log(`[db] MongoDB connected -> ${redactUri(env.mongoUri)}`);
  });

  mongoose.connection.on('error', (err) => {
    console.error('[db] MongoDB error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] MongoDB disconnected');
  });

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      connection = await mongoose.connect(env.mongoUri, env.mongoOptions);
      return connection;
    } catch (err) {
      const isLast = attempt === retries;
      console.error(
        `[db] Connection attempt ${attempt}/${retries} failed: ${err.message}`,
      );
      if (isLast) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return connection;
}

/** Close the connection (used on graceful shutdown and in tests). */
export async function disconnectDB() {
  if (connection) {
    await mongoose.disconnect();
    connection = null;
    console.log('[db] MongoDB connection closed');
  }
}

/** Current connection state, surfaced on the health endpoint. */
export function dbStatus() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return {
    state: states[mongoose.connection.readyState] ?? 'unknown',
    host: mongoose.connection.host ?? null,
    name: mongoose.connection.name ?? null,
  };
}

/** Hide credentials before logging a connection string. */
function redactUri(uri) {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
}
