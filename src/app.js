import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import * as Sentry from '@sentry/node';
import { env } from './config/env.js';
import { logger, httpLogger } from './config/logger.js';
import { prisma } from './db/prisma.js';
import { apiLimiter } from './middlewares/rateLimiter.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { NotFoundError } from './utils/errors.js';
import v1Router from './routes/v1.js';
import { handleCloudinaryWebhook } from './modules/reels/reels.webhook.js';

const app = express();

// ── Security Middleware ───────────────────────────────────────

app.use(helmet());

// Safe CORS configuration
const allowedProductionOrigins = new Set([
  'https://bazarr360.in',
  'https://www.bazarr360.in',
]);

const rawOrigins = (env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Reject wildcard from credentials-enabled origin list
const configuredOrigins = new Set(
  rawOrigins.filter((origin) => origin !== '*')
);

export const isOriginAllowed = (
  origin,
  currentEnv = env.NODE_ENV,
  customOrigins = configuredOrigins
) => {
  // Allow requests with no origin (e.g. mobile apps, curl, Postman, server-to-server)
  if (!origin) return true;

  // Never allow wildcard with credentials
  if (origin === '*') return false;

  // Standard production origins and configured origins are always allowed
  if (allowedProductionOrigins.has(origin)) return true;
  if (customOrigins instanceof Set ? customOrigins.has(origin) : customOrigins.includes(origin)) {
    return true;
  }

  // In non-production environments (development/test), allow local and LAN addresses
  if (currentEnv !== 'production') {
    const isLocalOrLan =
      /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(
        origin
      );
    if (isLocalOrLan) return true;
  }

  return false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    optionsSuccessStatus: 204,
  })
);

// ── Webhook Raw-Body Handling ──────────────────────────────────
// Cloudinary webhook signature verification requires exact raw body bytes before global JSON parsing
app.post(
  ['/api/v1/webhooks/cloudinary', '/api/v1/reels/cloudinary-webhook'],
  express.raw({ type: '*/*', limit: '2mb' }),
  handleCloudinaryWebhook
);

// ── Body Parsing ──────────────────────────────────────────────
// Standard JSON/URL-encoded limits. Direct video bytes never pass through Express.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── HTTP Request Logging ──────────────────────────────────────

app.use(httpLogger);

// ── Rate Limiting for API routes (TEMPORARILY DISABLED FOR K6 LOAD TESTING) ──
app.use('/api/', apiLimiter);

// ── Health Checks ─────────────────────────────────────────────

app.get('/health/live', (_req, res) => {
  res.status(200).json({ status: 'live', timestamp: new Date().toISOString() });
});

app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.set('trust proxy', 1);

// ── Root Endpoint ─────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.json({
    message: 'Free Video-First Marketplace API',
    version: 'v1',
    docs: '/api/v1',
  });
});

// ── API Version 1 Routes ──────────────────────────────────────

app.use('/api/v1', v1Router);

// ── Sentry Test Endpoint (Development / Diagnostics) ─────────
app.get('/debug-sentry', (_req, _res) => {
  throw new Error('Sentry test error from Bazarr360 server!');
});

// ── 404 Catch-All ─────────────────────────────────────────────

app.use((req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
});

// ── Sentry Error Handler ──────────────────────────────────────
Sentry.setupExpressErrorHandler(app);

// ── Centralized Error Handler ─────────────────────────────────

app.use(errorHandler);

export { logger };
export default app;
