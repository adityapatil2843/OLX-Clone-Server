import { prisma } from '../../db/prisma.js';
import { getPagination } from '../../utils/pagination.js';

const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  avatarUrl: true,
  bio: true,
  locationState: true,
  locationCity: true,
  role: true,
  isVerifiedSeller: true,
  createdAt: true,
};

export const findUserById = async (id, isPublic = true) => {
  return prisma.user.findFirst({
    where: {
      id,
      deletedAt: null,
      isActive: true,
    },
    select: isPublic
      ? PUBLIC_USER_SELECT
      : {
          ...PUBLIC_USER_SELECT,
          phone: true,
          email: true,
          isActive: true,
          updatedAt: true,
        },
  });
};

export const findUserByPhone = async (phone) => {
  return prisma.user.findUnique({
    where: { phone },
  });
};

export const findUserByEmail = async (email) => {
  return prisma.user.findUnique({
    where: { email },
  });
};

export const listUsers = async ({ search, page = 1, limit = 20 }) => {
  const { skip, take } = getPagination({ page, limit }, { defaultLimit: 20, maxLimit: 100 });

  const where = {
    deletedAt: null,
    isActive: true,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { locationCity: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const users = await prisma.user.findMany({
    where,
    select: PUBLIC_USER_SELECT,
    orderBy: { createdAt: 'desc' },
    skip,
    take,
  });

  const total = await prisma.user.count({ where });

  return { users, total };
};

export const createUser = async (data) => {
  return prisma.user.create({
    data,
    select: PUBLIC_USER_SELECT,
  });
};

export const updateUserProfile = async (id, data) => {
  return prisma.user.update({
    where: { id },
    data,
    select: PUBLIC_USER_SELECT,
  });
};

export const softDeleteUser = async (id) => {
  return prisma.user.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
    },
  });
};
