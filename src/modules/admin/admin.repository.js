import { prisma } from '../../db/prisma.js';

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
  ] = await prisma.$transaction([
    prisma.user.count({ where: { isActive: true, deletedAt: null } }),
    prisma.user.count(),
    prisma.reel.count({ where: { status: 'PUBLISHED', deletedAt: null } }),
    prisma.reel.count(),
    prisma.listing.count({ where: { status: 'ACTIVE', deletedAt: null } }),
    prisma.listing.count({ where: { status: 'SOLD' } }),
    prisma.listing.count(),
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
  const [logs, total] = await prisma.$transaction([
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
      skip: (page - 1) * limit,
      take: limit,
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
  const where = status ? { status } : {};
  const [reports, total] = await prisma.$transaction([
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
      skip: (page - 1) * limit,
      take: limit,
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
  return prisma.reel.update({
    where: { id },
    data: {
      status,
      ...(status === 'ARCHIVED' ? { deletedAt: new Date() } : {}),
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
