import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { env } from '../config/env.js';

/**
 * Role-based authorization middleware boundary.
 *
 * NOTE: Full authentication (OTP/JWT) is deferred.
 * This middleware establishes the security contract:
 * - In production: fail-closed if authentication/user identity is missing.
 * - In development: only allows bypass if explicitly configured via dev creator identity.
 * - Admins privileges must NEVER be self-assigned or accessed without required roles.
 *
 * @param {string[]} allowedRoles
 */
export const requireRole = (allowedRoles = ['ADMIN']) => {
  return (req, _res, next) => {
    // If no authenticated identity exists
    if (!req.user && !req.creatorId) {
      throw new UnauthorizedError('Authentication required to access this resource');
    }

    const currentRole = req.user?.role || 'USER';

    if (!allowedRoles.includes(currentRole)) {
      throw new ForbiddenError(
        `Insufficient privileges. Requires one of: ${allowedRoles.join(', ')}`
      );
    }

    next();
  };
};

/**
 * Require general authenticated identity.
 */
export const requireAuth = (req, _res, next) => {
  if (req.user || req.creatorId) {
    return next();
  }

  // Development fallback only if configured
  if (env.NODE_ENV === 'development' && env.DEV_TEST_CREATOR_ID) {
    req.creatorId = env.DEV_TEST_CREATOR_ID;
    return next();
  }

  throw new UnauthorizedError('Authentication required');
};
