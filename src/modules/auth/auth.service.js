import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import * as repo from './auth.repository.js';
import {
  ConflictError,
  UnauthorizedError,
  BadRequestError,
  NotFoundError,
} from '../../utils/errors.js';
import { AUTH_MESSAGES, OTP_PURPOSES } from './auth.constants.js';
import { sendOtpEmail } from '../../utils/email.js';

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
    jti: crypto.randomUUID(),
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
  phone = null,
  locationCity = null,
  locationState = null,
}) => {
  const existingUser = await repo.findUserByEmail(email);
  if (existingUser) {
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

// ── Email OTP Flows (Flow A) ────────────────────────────────────

/**
 * Requests an email OTP for registration, login, or password reset.
 */
export const requestOtp = async ({ email, purpose = OTP_PURPOSES.REGISTRATION }) => {
  const normalizedEmail = email.trim().toLowerCase();

  // If purpose is LOGIN or PASSWORD_RESET, check that account exists
  const existingUser = await repo.findUserByEmail(normalizedEmail);
  if (purpose === OTP_PURPOSES.LOGIN && !existingUser) {
    throw new NotFoundError('No account found with this email');
  }
  if (purpose === OTP_PURPOSES.PASSWORD_RESET && !existingUser) {
    throw new NotFoundError('No account found with this email');
  }

  // Generate 6-digit numeric OTP cryptographically
  const otp = crypto.randomInt(100000, 1000000).toString();
  const otpHash = await bcrypt.hash(otp, env.BCRYPT_SALT_ROUNDS);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

  await repo.createOtp({
    email: normalizedEmail,
    otpHash,
    purpose,
    expiresAt,
  });

  await sendOtpEmail({
    to: normalizedEmail,
    otp,
    purpose,
  });

  return {
    message: AUTH_MESSAGES.OTP_SENT_SUCCESS,
    email: normalizedEmail,
    purpose,
    expiresAt,
  };
};

/**
 * Verifies email OTP and returns authentication tokens if user exists.
 */
export const verifyOtp = async ({ email, otp, purpose = OTP_PURPOSES.REGISTRATION }) => {
  const normalizedEmail = email.trim().toLowerCase();
  const latestOtp = await repo.findLatestOtp({ email: normalizedEmail, purpose });

  if (!latestOtp) {
    throw new BadRequestError(AUTH_MESSAGES.INVALID_OTP);
  }

  if (new Date() > latestOtp.expiresAt) {
    throw new BadRequestError(AUTH_MESSAGES.OTP_EXPIRED);
  }

  if (latestOtp.attempts >= latestOtp.maxAttempts) {
    throw new BadRequestError(AUTH_MESSAGES.OTP_MAX_ATTEMPTS);
  }

  const isValid = await bcrypt.compare(otp, latestOtp.otpHash);
  if (!isValid) {
    await repo.incrementOtpAttempts(latestOtp.id);
    throw new BadRequestError(AUTH_MESSAGES.INVALID_OTP);
  }

  await repo.markOtpVerified(latestOtp.id);

  // If user already exists, authenticate and issue token pair
  const user = await repo.findUserByEmail(normalizedEmail);
  if (user) {
    if (!user.isActive) {
      throw new UnauthorizedError(AUTH_MESSAGES.USER_INACTIVE);
    }
    const tokens = await generateTokenPair(user);
    return {
      message: AUTH_MESSAGES.OTP_VERIFIED_SUCCESS,
      verified: true,
      user: sanitizeUser(user),
      tokens,
    };
  }

  return {
    message: AUTH_MESSAGES.OTP_VERIFIED_SUCCESS,
    verified: true,
    email: normalizedEmail,
    purpose,
  };
};

/**
 * Reset password using verified OTP.
 */
export const resetPassword = async ({ email, otp, newPassword }) => {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await repo.findUserByEmail(normalizedEmail);
  if (!user) {
    throw new NotFoundError('No account found with this email');
  }

  // Verify OTP for PASSWORD_RESET
  const verification = await verifyOtp({
    email: normalizedEmail,
    otp,
    purpose: OTP_PURPOSES.PASSWORD_RESET,
  });

  if (!verification.verified) {
    throw new BadRequestError(AUTH_MESSAGES.INVALID_OTP);
  }

  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS);
  await repo.updateUserPassword(user.id, passwordHash);

  // Revoke all existing sessions for security
  await repo.revokeAllUserTokens(user.id);

  return {
    message: AUTH_MESSAGES.PASSWORD_RESET_SUCCESS,
  };
};
