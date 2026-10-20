import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

/**
 * Middleware that restricts access to users with specified roles.
 *
 * @param {string[]} allowedRoles
 */
export const requireRole = (allowedRoles = []) => {
  return (req, _res, next) => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError(
        `Access forbidden: requires one of [${allowedRoles.join(', ')}] roles`
      );
    }

    next();
  };
};
