import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import * as repo from './auth.repository.js';
import {
  ConflictError,
  UnauthorizedError,
  BadRequestError,
} from '../../utils/errors.js';
import { AUTH_MESSAGES } from './auth.constants.js';

/**
 * Strips sensitive fields like passwordHash from user object before returning.
 */
export const sanitizeUser = (user) => {
  if (!user) return null;
  const { passwordHash, deletedAt, ...safeUser } = user;
  return safeUser;
};

/**
 * Calculates milliseconds from duration string like '7d', '15m'.
 */
const parseDurationMs = (durationStr) => {
  const match = /^(\d+)([smhd])$/.exec(String(durationStr));
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const val = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's':
      return val * 1000;
    case 'm':
      return val * 60 * 1000;
    case 'h':
      return val * 60 * 60 * 1000;
    case 'd':
      return val * 24 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
};

/**
 * Issues new access and refresh token pair for a user and records refresh token in DB.
 */
export const generateTokenPair = async (user) => {
  const accessPayload = {
    sub: user.id,
    role: user.role,
    email: user.email,
  };

  const accessToken = jwt.sign(accessPayload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  });

  const refreshPayload = {
    sub: user.id,
    type: 'refresh',
  };

  const refreshToken = jwt.sign(refreshPayload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  });

  const expiresAt = new Date(Date.now() + parseDurationMs(env.JWT_REFRESH_EXPIRES_IN));

  await repo.createRefreshToken({
    userId: user.id,
    token: refreshToken,
    expiresAt,
  });

  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  };
};

/**
 * Register a new user with email and password.
 */
export const register = async ({
  name,
  email,
  password,
  phone,
  locationCity,
  locationState,
}) => {
  const existingEmail = await repo.findUserByEmail(email);
  if (existingEmail) {
    throw new ConflictError(AUTH_MESSAGES.EMAIL_ALREADY_EXISTS);
  }

  if (phone) {
    const existingPhone = await repo.findUserByPhone(phone);
    if (existingPhone) {
      throw new ConflictError(AUTH_MESSAGES.PHONE_ALREADY_EXISTS);
    }
  }

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);

  const user = await repo.createUser({
    name,
    email,
    phone,
    passwordHash,
    locationCity,
    locationState,
  });

  const tokens = await generateTokenPair(user);

  return {
    user: sanitizeUser(user),
    tokens,
  };
};

/**
 * Log in with email and password.
 */
export const login = async ({ email, password }) => {
  const user = await repo.findUserByEmail(email);

  if (!user || !user.passwordHash) {
    throw new UnauthorizedError(AUTH_MESSAGES.INVALID_CREDENTIALS);
  }

  if (!user.isActive) {
    throw new UnauthorizedError(AUTH_MESSAGES.USER_INACTIVE);
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new UnauthorizedError(AUTH_MESSAGES.INVALID_CREDENTIALS);
  }

  const tokens = await generateTokenPair(user);

  return {
    user: sanitizeUser(user),
    tokens,
  };
};

/**
 * Rotate refresh token: verify existing, revoke it, and issue new pair.
 */
export const refreshTokens = async (refreshToken) => {
  if (!refreshToken) {
    throw new BadRequestError('Refresh token is required');
  }

  // 1. Verify JWT signature & structure
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
  } catch (err) {
    throw new UnauthorizedError(AUTH_MESSAGES.INVALID_REFRESH_TOKEN);
  }

  // 2. Lookup token in database
  const storedToken = await repo.findRefreshToken(refreshToken);

  if (!storedToken) {
    throw new UnauthorizedError(AUTH_MESSAGES.INVALID_REFRESH_TOKEN);
  }

  // 3. Ensure token is not revoked and not expired
  if (storedToken.revokedAt !== null || new Date() > storedToken.expiresAt) {
    throw new UnauthorizedError(AUTH_MESSAGES.INVALID_REFRESH_TOKEN);
  }

  const user = storedToken.user;
  if (!user || !user.isActive || user.deletedAt) {
    throw new UnauthorizedError(AUTH_MESSAGES.USER_INACTIVE);
  }

  // 4. Revoke old refresh token (Token Rotation for security)
  await repo.revokeRefreshToken(refreshToken);

  // 5. Issue brand new token pair
  const tokens = await generateTokenPair(user);

  return {
    tokens,
  };
};

/**
 * Log out user by revoking their refresh token.
 */
export const logout = async (refreshToken, userId = null) => {
  if (refreshToken) {
    await repo.revokeRefreshToken(refreshToken);
  } else if (userId) {
    await repo.revokeAllUserTokens(userId);
  }

  return {
    message: AUTH_MESSAGES.LOGOUT_SUCCESS,
  };
};

/**
 * Get profile for authenticated user.
 */
export const getCurrentUser = async (userId) => {
  const user = await repo.findUserById(userId);
  if (!user || !user.isActive) {
    throw new UnauthorizedError('User not found or inactive');
  }
  return sanitizeUser(user);
};
