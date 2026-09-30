/**
 * Centralised, validated environment configuration.
 * Fails fast at boot if a required variable is missing.
 */

import dotenv from 'dotenv';

dotenv.config();

const required = (key) => {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: (process.env.NODE_ENV ?? 'development') === 'production',
  port: Number(process.env.PORT ?? 5000),
  apiPrefix: process.env.API_PREFIX ?? '/api/v1',

  mongoUri: required('MONGODB_URI'),
  mongoOptions: {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 10,
    autoIndex: process.env.NODE_ENV !== 'production',
  },

  // --- JWT / auth ---
  jwt: {
    secret: required('JWT_SECRET'),
    // Short-lived access token; no refresh-token flow yet.
    expiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
    issuer: process.env.JWT_ISSUER ?? 'sih26009-api',
  },
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 12),
  maxFailedLogins: Number(process.env.MAX_FAILED_LOGINS ?? 5),
  lockoutMinutes: Number(process.env.LOCKOUT_MINUTES ?? 15),

  // --- Seeded default administrator ---
  admin: {
    email: process.env.ADMIN_EMAIL ?? 'admin@moil.gov.in',
    // Required in production; falls back to a documented dev default with a
    // loud warning so a first boot always succeeds.
    password:
      process.env.ADMIN_PASSWORD ??
      ((process.env.NODE_ENV ?? 'development') === 'production'
        ? required('ADMIN_PASSWORD')
        : 'Admin@12345'),
    fullName: process.env.ADMIN_FULL_NAME ?? 'Platform Administrator',
  },

  weather: {
    apiKey: required('WEATHER_API_KEY'),
    baseUrl: process.env.WEATHER_API_BASE_URL ?? 'https://api.openweathermap.org/data/2.5',
  },

  aiServiceUrl: process.env.AI_SERVICE_URL ?? 'http://localhost:8000',

  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};
