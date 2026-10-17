/**
 * Reels repository — all Prisma queries live here.
 * Controllers and services never import prisma directly.
 */

import { prisma } from '../../db/prisma.js';
import { REEL_STATUS } from './reels.constants.js';

// ── Create ────────────────────────────────────────────────────

/**
 * @param {object} data  Validated fields from createReelSchema
 * @param {string} creatorId
 */
export const createReel = async (data, creatorId) => {
  return prisma.reel.create({
    data: {
      ...data,
      creatorId,
    },
  });
};

// ── Find one (non-deleted) ────────────────────────────────────

export const findReelById = async (reelId) => {
  return prisma.reel.findFirst({
    where: {
      id: reelId,
      deletedAt: null,
    },
  });
};

// ── List / feed ───────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {number} opts.page
 * @param {number} opts.limit
 * @param {string} [opts.status]
 * @param {string} [opts.creatorId]
 */
export const listReels = async ({ page, limit, status, creatorId }) => {
  const skip = (page - 1) * limit;

  const where = {
    deletedAt: null,
    status: status ?? REEL_STATUS.PUBLISHED,
    ...(creatorId ? { creatorId } : {}),
  };

  const [reels, total] = await prisma.$transaction([
    prisma.reel.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.reel.count({ where }),
  ]);

  return { reels, total };
};

// ── Update ────────────────────────────────────────────────────

/**
 * @param {string} reelId
 * @param {object} data  Already validated + allowlisted
 */
export const updateReel = async (reelId, data) => {
  return prisma.reel.update({
    where: { id: reelId },
    data,
  });
};

// ── Update status (internal — service use only) ───────────────

export const updateReelStatus = async (reelId, status) => {
  return prisma.reel.update({
    where: { id: reelId },
    data: { status },
  });
};

// ── Soft-delete ───────────────────────────────────────────────

export const softDeleteReel = async (reelId) => {
  return prisma.reel.update({
    where: { id: reelId },
    data: {
      deletedAt: new Date(),
      status: REEL_STATUS.ARCHIVED,
    },
  });
};

// ── Update media keys (called after upload confirmation) ──────

/**
 * @param {string} reelId
 * @param {{ videoStorageKey: string, thumbnailStorageKey?: string, videoProvider: string, durationMs?: number, width?: number, height?: number }} mediaData
 */
export const updateReelMedia = async (reelId, mediaData) => {
  return prisma.reel.update({
    where: { id: reelId },
    data: {
      ...mediaData,
      status: REEL_STATUS.PROCESSING, // advance lifecycle
    },
  });
};
