import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const shouldSkipRateLimit = (req) => {
  // Test mode mein hamesha skip
  if (env.NODE_ENV === 'test') return true;

  // Development mode mein: K6 aur localhost ko bypass
  if (env.NODE_ENV === 'development') {
    const userAgent = req.headers['user-agent'] || '';
    if (userAgent.toLowerCase().includes('k6')) {
      return true;
    }

    const ip = req.ip || req.socket?.remoteAddress || '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  }

  return false;
};

export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Too many requests from this IP, please try again later.',
    },
  },
  skip: shouldSkipRateLimit,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Too many authentication attempts, please try again later.',
    },
  },
  skip: shouldSkipRateLimit,
});

export default apiLimiter;
