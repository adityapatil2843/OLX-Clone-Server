import { prisma } from '../../db/prisma.js';
import { getPagination } from '../../utils/pagination.js';

export const getPlatformMetrics = async () => {
  const [
    activeUsers,
    totalUsers,
    publishedReels,
    totalReels,
    activeListings,
    soldListings,
    totalListings,
    activeAdvertisements,
    totalAdvertisements,
    pendingReports,
  ] = await Promise.all([
    prisma.user.count({ where: { isActive: true, deletedAt: null } }),
    prisma.user.count(),
    prisma.reel.count({ where: { visibilityState: 'PUBLISHED', deletedAt: null } }),
    prisma.reel.count({ where: { deletedAt: null } }),
    prisma.listing.count({ where: { status: 'ACTIVE', deletedAt: null } }),
    prisma.listing.count({ where: { status: 'SOLD' } }),
    prisma.listing.count({ where: { deletedAt: null } }),
    prisma.advertisement.count({ where: { status: 'ACTIVE' } }),
    prisma.advertisement.count(),
    prisma.report.count({ where: { status: 'PENDING' } }),
  ]);

  return {
    users: {
      active: activeUsers,
      total: totalUsers,
    },
    reels: {
      published: publishedReels,
      total: totalReels,
    },
    listings: {
      active: activeListings,
      sold: soldListings,
      total: totalListings,
    },
    advertisements: {
      active: activeAdvertisements,
      total: totalAdvertisements,
    },
    reports: {
      pending: pendingReports,
    },
    retrievedAt: new Date(),
  };
};

export const createAuditLog = async ({ adminId, action, targetType, targetId, details }) => {
  return prisma.adminAuditLog.create({
    data: {
      adminId,
      action,
      targetType,
      targetId,
      details,
    },
  });
};

export const listAuditLogs = async ({ page = 1, limit = 20 }) => {
  const { skip, take } = getPagination({ page, limit }, { defaultLimit: 20, maxLimit: 100 });
  const [logs, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      include: {
        admin: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.adminAuditLog.count(),
  ]);

  return { logs, total };
};

export const createReport = async (data) => {
  return prisma.report.create({
    data,
    include: {
      reporter: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
};

export const listReports = async ({ page = 1, limit = 20, status = null }) => {
  const { skip, take } = getPagination({ page, limit }, { defaultLimit: 20, maxLimit: 100 });
  const where = status ? { status } : {};
  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      include: {
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.report.count({ where }),
  ]);

  return { reports, total };
};

export const updateReport = async (id, data) => {
  return prisma.report.update({
    where: { id },
    data,
  });
};

export const updateListingStatus = async (id, status) => {
  return prisma.listing.update({
    where: { id },
    data: {
      status,
      ...(status === 'ARCHIVED' ? { deletedAt: new Date() } : {}),
    },
  });
};

export const updateReelStatus = async (id, status) => {
  const visibilityState = ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'MODERATED'].includes(status) ? status : 'DRAFT';
  return prisma.reel.update({
    where: { id },
    data: {
      visibilityState,
      ...(visibilityState === 'ARCHIVED' ? { deletedAt: new Date() } : {}),
    },
  });
};

export const updateUser = async (id, data) => {
  return prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });
};
