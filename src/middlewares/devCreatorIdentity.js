/**
 * Development-only creator identity middleware.
 *
 * PURPOSE: Attach a test creatorId to req so Reels endpoints work
 *   during development without a real auth system.
 *
 * SAFETY RULES:
 *   - Only active when NODE_ENV=development AND DEV_TEST_CREATOR_ID is set.
 *   - Server startup fails explicitly if this is enabled in production.
 *   - Replace this middleware with real JWT/session auth when auth is built.
 */

import { env } from '../config/env.js';
import { UnauthorizedError } from '../utils/errors.js';

const DEV_CREATOR_ID = env.DEV_TEST_CREATOR_ID;
const IS_PRODUCTION = env.NODE_ENV === 'production';

// ── Boot-time guard ────────────────────────────────────────────
// Called once during server startup — not on every request.

export const assertDevIdentityIsSafe = () => {
  if (IS_PRODUCTION && DEV_CREATOR_ID) {
    console.error(
      '❌ FATAL: DEV_TEST_CREATOR_ID is set in a production environment. ' +
      'Remove it from .env and restart.'
    );
    process.exit(1);
  }
};

// ── Per-request middleware ─────────────────────────────────────

export const devCreatorIdentity = (req, res, next) => {
  if (!IS_PRODUCTION && DEV_CREATOR_ID) {
    // Attach the dev identity so controllers can read req.creatorId
    req.creatorId = DEV_CREATOR_ID;
    return next();
  }

  // If dev identity is not available and no real auth is present,
  // return 401 so we fail closed rather than accepting anonymous writes.
  if (!req.creatorId) {
    throw new UnauthorizedError('Authentication required');
  }

  next();
};
