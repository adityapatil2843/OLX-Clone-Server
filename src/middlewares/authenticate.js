import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../utils/errors.js';

/**
 * Extracts Bearer token from Authorization header.
 *
 * @param {import('express').Request} req
 * @returns {string|null}
 */
const extractBearerToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return parts[1];
  }

  return null;
};

import { prisma } from '../db/prisma.js';

let devUserEnsured = false;

/**
 * Strict authentication middleware.
 * Verifies JWT access token and sets req.user and req.creatorId.
 */
export const authenticate = async (req, _res, next) => {
  const token = extractBearerToken(req);

  if (!token) {
    // Development fallback if DEV_TEST_CREATOR_ID is configured and not in production
    if (env.NODE_ENV === 'development' && env.DEV_TEST_CREATOR_ID) {
      req.user = {
        id: env.DEV_TEST_CREATOR_ID,
        role: 'USER',
      };
      req.creatorId = env.DEV_TEST_CREATOR_ID;

      if (!devUserEnsured) {
        try {
          await prisma.user.upsert({
            where: { id: env.DEV_TEST_CREATOR_ID },
            update: {},
            create: {
              id: env.DEV_TEST_CREATOR_ID,
              name: 'Dev Creator',
              email: 'dev-creator@example.com',
              role: 'USER',
            },
          });
          devUserEnsured = true;
        } catch (_err) {
          // ignore if already created concurrently
        }
      }
      return next();
    }

    throw new UnauthorizedError('Authentication token is required');
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    req.user = {
      id: decoded.sub,
      role: decoded.role || 'USER',
      email: decoded.email,
    };
    req.creatorId = decoded.sub;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Authentication token has expired');
    }
    throw new UnauthorizedError('Invalid authentication token');
  }
};

/**
 * Optional authentication middleware.
 * If token is present, verifies it and sets req.user; otherwise proceeds.
 */
export const optionalAuthenticate = (req, _res, next) => {
  const token = extractBearerToken(req);

  if (!token) {
    if (env.NODE_ENV === 'development' && env.DEV_TEST_CREATOR_ID) {
      req.user = {
        id: env.DEV_TEST_CREATOR_ID,
        role: 'USER',
      };
      req.creatorId = env.DEV_TEST_CREATOR_ID;
    }
    return next();
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    req.user = {
      id: decoded.sub,
      role: decoded.role || 'USER',
      email: decoded.email,
    };
    req.creatorId = decoded.sub;
  } catch (err) {
    // For optional auth, ignore invalid tokens or proceed without req.user
  }

  next();
};
