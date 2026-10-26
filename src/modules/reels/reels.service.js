/**
 * Reels service — business rules live here.
 * Controllers call the service; the service calls the repository.
 */

import * as repo from './reels.repository.js';
import { generateUploadSignature, getSignedDeliveryUrl, uploadBufferToCloudinary } from './reels.storage.js';
import { REEL_STATUS, REEL_UPDATABLE_FIELDS } from './reels.constants.js';
import { ApiError, NotFoundError, ForbiddenError, ConflictError } from '../../utils/errors.js';
import { prisma } from '../../db/prisma.js';

// ── Helpers ───────────────────────────────────────────────────

const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

export class ReelError extends ApiError {
  constructor(message, statusCode = 400) {
    super(message, statusCode);
    this.name = 'ReelError';
  }
}

const formatReel = (reel) => {
  if (!reel) return reel;
  const { _count, likes, savedBy, ...rest } = reel;
  const isPoster = reel.thumbnailStorageKey && reel.thumbnailStorageKey === reel.videoStorageKey;
  return {
    ...rest,
    title: reel.caption || reel.listing?.title || 'Product Reel',
    description: reel.caption,
    videoUrl: reel.videoStorageKey
      ? (reel.videoStorageKey.startsWith('http') ? reel.videoStorageKey : getSignedDeliveryUrl(reel.videoStorageKey, 'video'))
      : null,
    thumbnailUrl: reel.thumbnailStorageKey
      ? (reel.thumbnailStorageKey.startsWith('http')
          ? reel.thumbnailStorageKey
          : (isPoster
              ? getSignedDeliveryUrl(reel.thumbnailStorageKey + '.jpg', 'video')
              : getSignedDeliveryUrl(reel.thumbnailStorageKey, 'image')))
      : null,
    likesCount: _count?.likes ?? 0,
    commentsCount: _count?.comments ?? 0,
    ...(likes !== undefined ? { isLiked: likes.length > 0 } : {}),
    ...(savedBy !== undefined ? { isSaved: savedBy.length > 0 } : {}),
  };
};

// ── Create ────────────────────────────────────────────────────

export const createReel = async (validatedBody, creatorId) => {
  if (validatedBody.listingId) {
    const listing = await prisma.listing.findFirst({
      where: { id: validatedBody.listingId, deletedAt: null },
    });
    if (!listing) {
      throw new NotFoundError('Linked listing not found');
    }
    if (listing.ownerId !== creatorId) {
      throw new ForbiddenError('You can only attach reels to your own product');
    }
  }

  const reel = await repo.createReel(validatedBody, creatorId);
  return formatReel(reel);
};

// ── Get one ───────────────────────────────────────────────────

export const getReelById = async (reelId, userId = null) => {
  const reel = await repo.findReelById(reelId, userId);
  if (!reel) {
    throw new NotFoundError(`Reel ${reelId} not found`);
  }

  return formatReel(reel);
};

// ── List / Feed ───────────────────────────────────────────────

export const listReels = async (queryParams, userId = null) => {
  const result = await repo.listReels({ ...queryParams, userId });

  if (queryParams.cursor) {
    return {
      data: result.reels.map(formatReel),
      meta: {
        cursor: queryParams.cursor,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
        limit: queryParams.limit,
      },
    };
  }

  const { page, limit } = queryParams;
  return {
    data: result.reels.map(formatReel),
    meta: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
      hasNextPage: page * limit < result.total,
    },
  };
};

// ── Update ────────────────────────────────────────────────────

export const updateReel = async (reelId, validatedBody, requestorCreatorId) => {
  const existing = await repo.findReelById(reelId);
  if (!existing) {
    throw new NotFoundError(`Reel ${reelId} not found`);
  }

  if (existing.creatorId !== requestorCreatorId) {
    throw new ForbiddenError('You do not own this Reel');
  }

  if (existing.status === REEL_STATUS.ARCHIVED) {
    throw new ConflictError('Cannot update an archived Reel');
  }

  const safeData = pick(validatedBody, [...REEL_UPDATABLE_FIELDS, 'status']);
  const updated = await repo.updateReel(reelId, safeData);
  return formatReel(updated);
};

// ── Soft-delete ───────────────────────────────────────────────

export const deleteReel = async (reelId, requestorCreatorId) => {
  const existing = await repo.findReelById(reelId);
  if (!existing) {
    throw new NotFoundError(`Reel ${reelId} not found`);
  }

  if (existing.creatorId !== requestorCreatorId) {
    throw new ForbiddenError('You do not own this Reel');
  }

  if (existing.status === REEL_STATUS.ARCHIVED) {
    throw new ConflictError('Reel is already archived');
  }

  return repo.softDeleteReel(reelId);
};

// ── Request signed upload params ──────────────────────────────

export const requestUpload = (reelId, creatorId) => {
  return generateUploadSignature({ reelId, creatorId });
};

// ── Confirm upload and advance status ─────────────────────────

export const confirmUpload = async (reelId, mediaData, requestorCreatorId) => {
  const existing = await repo.findReelById(reelId);
  if (!existing) {
    throw new NotFoundError(`Reel ${reelId} not found`);
  }
  if (existing.creatorId !== requestorCreatorId) {
    throw new ForbiddenError('You do not own this Reel');
  }
  if (existing.status !== REEL_STATUS.DRAFT && existing.status !== REEL_STATUS.FAILED) {
    throw new ConflictError(
      `Cannot confirm upload for a Reel in status ${existing.status}`
    );
  }

  const updated = await repo.updateReelMedia(reelId, mediaData);
  return formatReel(updated);
};

export const uploadReelDirect = async (reelId, requestorCreatorId, videoFile, thumbnailFile = null) => {
  if (!videoFile) {
    throw new ReelError('Video file is required for direct upload', 400);
  }

  const existing = await repo.findReelById(reelId);
  if (!existing) {
    throw new NotFoundError(`Reel ${reelId} not found`);
  }
  if (existing.creatorId !== requestorCreatorId) {
    throw new ForbiddenError('You do not own this Reel');
  }
  if (existing.status === REEL_STATUS.ARCHIVED) {
    throw new ConflictError('Cannot upload media for an archived Reel');
  }

  const folder = `reels/${requestorCreatorId}`;
  const videoUpload = await uploadBufferToCloudinary(videoFile.buffer, {
    resourceType: 'video',
    folder,
    publicId: `${reelId}`,
    overwrite: true,
  });

  let thumbnailStorageKey = null;
  if (thumbnailFile) {
    const thumbUpload = await uploadBufferToCloudinary(thumbnailFile.buffer, {
      resourceType: 'image',
      folder: `${folder}/thumbs`,
      publicId: `${reelId}`,
      overwrite: true,
    });
    thumbnailStorageKey = thumbUpload.secure_url || thumbUpload.public_id;
  }

  const videoUrl = videoUpload.secure_url || videoUpload.public_id;
  const posterUrl = videoUpload.secure_url
    ? videoUpload.secure_url.replace(/\.[^.]+$/, '.jpg')
    : videoUpload.public_id;

  const mediaData = {
    videoStorageKey: videoUrl,
    thumbnailStorageKey: thumbnailStorageKey || posterUrl,
    videoProvider: 'cloudinary',
    durationMs: videoUpload.duration ? Math.round(videoUpload.duration * 1000) : 15000,
    width: videoUpload.width || 1080,
    height: videoUpload.height || 1920,
    status: REEL_STATUS.PUBLISHED,
  };

  const updated = await repo.updateReelMedia(reelId, mediaData);
  return formatReel(updated);
};


// ── Engagement: Likes ──────────────────────────────────────────

export const likeReel = async (reelId, userId) => {
  const reel = await repo.findReelById(reelId);
  if (!reel) throw new NotFoundError('Reel not found');
  await repo.likeReel(userId, reelId);
  return { message: 'Reel liked successfully', reelId };
};

export const unlikeReel = async (reelId, userId) => {
  const reel = await repo.findReelById(reelId);
  if (!reel) throw new NotFoundError('Reel not found');
  await repo.unlikeReel(userId, reelId);
  return { message: 'Reel unliked successfully', reelId };
};

// ── Engagement: Saves ──────────────────────────────────────────

export const saveReel = async (reelId, userId) => {
  const reel = await repo.findReelById(reelId);
  if (!reel) throw new NotFoundError('Reel not found');
  await repo.saveReel(userId, reelId);
  return { message: 'Reel saved successfully', reelId };
};

export const unsaveReel = async (reelId, userId) => {
  const reel = await repo.findReelById(reelId);
  if (!reel) throw new NotFoundError('Reel not found');
  await repo.unsaveReel(userId, reelId);
  return { message: 'Reel removed from saved', reelId };
};

// ── Engagement: Comments ───────────────────────────────────────

export const addComment = async (reelId, userId, text) => {
  const reel = await repo.findReelById(reelId);
  if (!reel) throw new NotFoundError('Reel not found');
  return repo.createComment(userId, reelId, text);
};

export const getComments = async (reelId, query) => {
  const reel = await repo.findReelById(reelId);
  if (!reel) throw new NotFoundError('Reel not found');
  const { page = 1, limit = 20 } = query;
  const result = await repo.listComments(reelId, page, limit);
  return {
    data: result.comments,
    meta: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
      hasNextPage: page * limit < result.total,
    },
  };
};
