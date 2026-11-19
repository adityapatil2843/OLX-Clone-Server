import pino from 'pino';
import pinoHttp from 'pino-http';
import crypto from 'crypto';
import { env } from './env.js';

let prettyTransport = {};
if (env.NODE_ENV === 'development') {
  try {
    // Check if pino-pretty is available dynamically without crashing if omitted
    await import('pino-pretty');
    prettyTransport = {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, ignore: 'pid,hostname' },
      },
    };
  } catch {
    prettyTransport = {};
  }
}

export const logger = pino({
  level: env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'req.body.password',
      'req.body.token',
      'req.body.secret',
      'req.body.refreshToken',
      'req.body.accessToken',
      'req.body.newPassword',
      'req.body.otp',
      'req.body.content',
      'req.body.text',
      'req.body.phone',
      'req.body.contactPhone',
      'req.headers["x-refresh-token"]',
      'DATABASE_URL',
      'DIRECT_URL',
      'CLOUDINARY_API_SECRET',
    ],
    remove: true,
  },
  ...prettyTransport,
});

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
  serializers: {
    req: (req) => {
      const isAuth = req.url && req.url.includes('/auth');
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        // Never log request bodies for authentication endpoints
        ...(isAuth ? {} : { body: req.raw?.body }),
      };
    },
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    if (res.responseTime && res.responseTime > 1000) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} ${res.statusCode} - ${err.message}`,
});

export default logger;
