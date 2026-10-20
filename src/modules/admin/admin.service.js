import * as repo from './admin.repository.js';
import { prisma } from '../../db/prisma.js';
import { NotFoundError } from '../../utils/errors.js';
import { ADMIN_ACTIONS } from './admin.constants.js';
import { stopListingAdvertisements } from '../advertisements/advertisements.service.js';

export const getMetrics = async () => {
  return repo.getPlatformMetrics();
};

export const moderateListing = async (listingId, { status, reason }, adminId) => {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
  });

  if (!listing) {
    throw new NotFoundError(`Listing '${listingId}' not found`);
  }

  const previousStatus = listing.status;
  const updated = await repo.updateListingStatus(listingId, status);

  if (status === 'SOLD' || status === 'ARCHIVED') {
    await stopListingAdvertisements(listingId);
  }

  await repo.createAuditLog({
    adminId,
    action: ADMIN_ACTIONS.MODERATE_LISTING,
    targetType: 'LISTING',
    targetId: listingId,
    details: {
      previousStatus,
      newStatus: status,
      reason: reason || null,
    },
  });

  return updated;
};

export const moderateReel = async (reelId, { status, reason }, adminId) => {
  const reel = await prisma.reel.findUnique({
    where: { id: reelId },
  });

  if (!reel) {
    throw new NotFoundError(`Reel '${reelId}' not found`);
  }

  const previousStatus = reel.status;
  const updated = await repo.updateReelStatus(reelId, status);

  await repo.createAuditLog({
    adminId,
    action: ADMIN_ACTIONS.MODERATE_REEL,
    targetType: 'REEL',
    targetId: reelId,
    details: {
      previousStatus,
      newStatus: status,
      reason: reason || null,
    },
  });

  return updated;
};

export const moderateUser = async (userId, { isActive, role, reason }, adminId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError(`User '${userId}' not found`);
  }

  const dataToUpdate = {};
  if (isActive !== undefined) dataToUpdate.isActive = isActive;
  if (role !== undefined) dataToUpdate.role = role;

  const updated = await repo.updateUser(userId, dataToUpdate);

  await repo.createAuditLog({
    adminId,
    action: ADMIN_ACTIONS.MODERATE_USER,
    targetType: 'USER',
    targetId: userId,
    details: {
      previousState: { isActive: user.isActive, role: user.role },
      newState: dataToUpdate,
      reason: reason || null,
    },
  });

  return updated;
};

export const fileReport = async (payload, reporterId) => {
  return repo.createReport({
    reporterId,
    targetType: payload.targetType,
    targetId: payload.targetId,
    reason: payload.reason,
    details: payload.details || null,
  });
};

export const listReports = async (query) => {
  const { page = 1, limit = 20, status = null } = query;
  const result = await repo.listReports({ page, limit, status });

  return {
    data: result.reports,
    meta: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
      hasNextPage: page * limit < result.total,
    },
  };
};

export const resolveReport = async (reportId, payload, adminId) => {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
  });

  if (!report) {
    throw new NotFoundError(`Report '${reportId}' not found`);
  }

  const updated = await repo.updateReport(reportId, {
    status: payload.status,
    resolutionNotes: payload.resolutionNotes || null,
    resolvedAt: new Date(),
  });

  await repo.createAuditLog({
    adminId,
    action: ADMIN_ACTIONS.RESOLVE_REPORT,
    targetType: 'REPORT',
    targetId: reportId,
    details: {
      previousStatus: report.status,
      newStatus: payload.status,
      resolutionNotes: payload.resolutionNotes || null,
    },
  });

  return updated;
};

export const listAuditLogs = async (query) => {
  const { page = 1, limit = 20 } = query;
  const result = await repo.listAuditLogs({ page, limit });

  return {
    data: result.logs,
    meta: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
      hasNextPage: page * limit < result.total,
    },
  };
};
