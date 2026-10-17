import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

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
  skip: () => env.NODE_ENV === 'test',
});

export default apiLimiter;
