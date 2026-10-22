import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { logger, httpLogger } from './config/logger.js';
import { prisma } from './db/prisma.js';
import { apiLimiter } from './middlewares/rateLimiter.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { NotFoundError } from './utils/errors.js';
import v1Router from './routes/v1.js';

const app = express();

// ── Security Middleware ───────────────────────────────────────

app.use(helmet());

// Safe CORS configuration
const isWildcardOrigin = env.CORS_ORIGIN === '*';
const configuredOrigins = isWildcardOrigin
  ? []
  : env.CORS_ORIGIN.split(',').map((origin) => origin.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, Postman)
      if (!origin) return callback(null, true);

      if (isWildcardOrigin) return callback(null, true);
      if (configuredOrigins.includes(origin)) return callback(null, true);

      // In development mode, automatically allow localhost and private network IP origins (e.g. Expo Web on 8081)
      if (env.NODE_ENV === 'development') {
        const isLocalOrLan =
          /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(
            origin
          );
        if (isLocalOrLan) return callback(null, true);
      }

      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);

// ── Body Parsing ──────────────────────────────────────────────

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── HTTP Request Logging ──────────────────────────────────────

app.use(httpLogger);

// ── Rate Limiting for API routes ──────────────────────────────

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

// ── 404 Catch-All ─────────────────────────────────────────────

app.use((req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
});

// ── Centralized Error Handler ─────────────────────────────────

app.use(errorHandler);

export { logger };
export default app;
