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
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} ${res.statusCode} - ${err.message}`,
});

export default logger;
