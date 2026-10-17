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
const corsOrigins = isWildcardOrigin
  ? '*'
  : env.CORS_ORIGIN.split(',').map((origin) => origin.trim());

app.use(
  cors({
    origin: corsOrigins,
    // Browsers forbid credentials with wildcard '*' origin
    credentials: !isWildcardOrigin,
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
