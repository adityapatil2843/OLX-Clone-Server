/**
 * Reels repository — all Prisma queries live here.
 * Controllers and services never import prisma directly.
 */

import { prisma } from '../../db/prisma.js';
import { REEL_STATUS } from './reels.constants.js';

const publicReelInclude = (userId = null) => ({
  creator: {
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      isVerifiedSeller: true,
    },
  },
  listing: {
    select: {
      id: true,
      title: true,
      price: true,
      currency: true,
      status: true,
      locationCity: true,
      locationState: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  _count: {
    select: {
      likes: true,
      comments: true,
    },
  },
  ...(userId
    ? {
        likes: { where: { userId }, select: { id: true } },
        savedBy: { where: { userId }, select: { id: true } },
      }
    : {}),
});

// ── Create ────────────────────────────────────────────────────

export const createReel = async (data, creatorId) => {
  return prisma.reel.create({
    data: {
      ...data,
      creatorId,
    },
    include: publicReelInclude(creatorId),
  });
};

// ── Find one (non-deleted) ────────────────────────────────────

export const findReelById = async (reelId, userId = null) => {
  return prisma.reel.findFirst({
    where: {
      id: reelId,
      deletedAt: null,
    },
    include: publicReelInclude(userId),
  });
};

// ── List / feed (with cursor support) ─────────────────────────

export const listReels = async ({
  page = 1,
  limit = 20,
  cursor,
  status,
  creatorId,
  categoryId,
  listingId,
  userId = null,
}) => {
  const where = {
    deletedAt: null,
    ...(status && status !== 'ALL'
      ? { status }
      : { status: { in: [REEL_STATUS.PUBLISHED, REEL_STATUS.PROCESSING] } }),
    ...(creatorId ? { creatorId } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(listingId ? { listingId } : {}),
  };

  if (cursor) {
    // Cursor-based pagination
    const reels = await prisma.reel.findMany({
      where,
      include: publicReelInclude(userId),
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      cursor: { id: cursor },
      skip: 1,
    });

    const hasMore = reels.length > limit;
    const items = hasMore ? reels.slice(0, limit) : reels;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      reels: items,
      hasMore,
      nextCursor,
      total: null,
    };
  }

  // Offset pagination fallback
  const skip = (page - 1) * limit;

  const [reels, total] = await Promise.all([
    prisma.reel.findMany({
      where,
      include: publicReelInclude(userId),
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.reel.count({ where }),
  ]);

  return { reels, total };
};

// ── Update ────────────────────────────────────────────────────

export const updateReel = async (reelId, data) => {
  return prisma.reel.update({
    where: { id: reelId },
    data,
    include: publicReelInclude(),
  });
};

// ── Update status ─────────────────────────────────────────────

export const updateReelStatus = async (reelId, status) => {
  return prisma.reel.update({
    where: { id: reelId },
    data: { status },
    include: publicReelInclude(),
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
    include: publicReelInclude(),
  });
};

// ── Update media keys (called after upload confirmation) ──────

export const updateReelMedia = async (reelId, mediaData) => {
  return prisma.reel.update({
    where: { id: reelId },
    data: {
      status: mediaData.status || REEL_STATUS.PUBLISHED,
      ...mediaData,
    },
    include: publicReelInclude(),
  });
};

// ── Engagement: Likes ──────────────────────────────────────────

export const likeReel = async (userId, reelId) => {
  return prisma.reelLike.upsert({
    where: {
      userId_reelId: { userId, reelId },
    },
    update: {},
    create: {
      userId,
      reelId,
    },
  });
};

export const unlikeReel = async (userId, reelId) => {
  return prisma.reelLike.deleteMany({
    where: {
      userId,
      reelId,
    },
  });
};

// ── Engagement: Saves ──────────────────────────────────────────

export const saveReel = async (userId, reelId) => {
  return prisma.savedReel.upsert({
    where: {
      userId_reelId: { userId, reelId },
    },
    update: {},
    create: {
      userId,
      reelId,
    },
  });
};

export const unsaveReel = async (userId, reelId) => {
  return prisma.savedReel.deleteMany({
    where: {
      userId,
      reelId,
    },
  });
};

// ── Engagement: Comments ───────────────────────────────────────

export const createComment = async (userId, reelId, text) => {
  return prisma.reelComment.create({
    data: {
      userId,
      reelId,
      text,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
    },
  });
};

export const listComments = async (reelId, page = 1, limit = 20) => {
  const where = {
    reelId,
    deletedAt: null,
  };

  const [comments, total] = await prisma.$transaction([
    prisma.reelComment.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.reelComment.count({ where }),
  ]);

  return { comments, total };
};
