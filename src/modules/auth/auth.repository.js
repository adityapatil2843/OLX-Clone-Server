import { prisma } from '../../db/prisma.js';

export const findUserByEmail = async (email) => {
  return prisma.user.findFirst({
    where: {
      email,
      deletedAt: null,
    },
  });
};

export const findUserByPhone = async (phone) => {
  return prisma.user.findFirst({
    where: {
      phone,
      deletedAt: null,
    },
  });
};

export const findUserById = async (id) => {
  return prisma.user.findFirst({
    where: {
      id,
      deletedAt: null,
    },
  });
};

export const createUser = async ({
  name,
  email,
  phone,
  passwordHash,
  locationCity,
  locationState,
}) => {
  return prisma.user.create({
    data: {
      name,
      email,
      phone,
      passwordHash,
      locationCity,
      locationState,
    },
  });
};

export const updateUserPassword = async (userId, passwordHash) => {
  return prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
};

export const createRefreshToken = async ({ userId, token, expiresAt }) => {
  return prisma.refreshToken.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });
};

export const findRefreshToken = async (token) => {
  return prisma.refreshToken.findUnique({
    where: { token },
    include: {
      user: true,
    },
  });
};

export const revokeRefreshToken = async (token) => {
  return prisma.refreshToken.updateMany({
    where: {
      token,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
};

export const revokeAllUserTokens = async (userId) => {
  return prisma.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
};

// ── OTP Repository Methods ─────────────────────────────────────

export const createOtp = async ({ email, otpHash, purpose, expiresAt }) => {
  // Invalidate previous active OTPs for this email and purpose
  await prisma.emailOtp.deleteMany({
    where: {
      email,
      purpose,
      verifiedAt: null,
    },
  });

  return prisma.emailOtp.create({
    data: {
      email,
      otpHash,
      purpose,
      expiresAt,
    },
  });
};

export const findLatestOtp = async ({ email, purpose }) => {
  return prisma.emailOtp.findFirst({
    where: {
      email,
      purpose,
      verifiedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
};

export const incrementOtpAttempts = async (otpId) => {
  return prisma.emailOtp.update({
    where: { id: otpId },
    data: {
      attempts: { increment: 1 },
    },
  });
};

export const markOtpVerified = async (otpId) => {
  return prisma.emailOtp.update({
    where: { id: otpId },
    data: {
      verifiedAt: new Date(),
    },
  });
};
