/**
 * Reels service — business rules live here.
 * Controllers call the service; the service calls the repository.
 * Direct Prisma queries are forbidden in this layer.
 */

import crypto from 'node:crypto';
import * as repo from './reels.repository.js';
import { generateUploadSignature, getSignedDeliveryUrl, optimizeCloudinaryUrl } from '../../integrations/storage/cloudinary.service.js';
import { REEL_STATUS, REEL_VISIBILITY_STATE, REEL_UPDATABLE_FIELDS } from './reels.constants.js';
import { ApiError, NotFoundError, ForbiddenError, ConflictError } from '../../utils/errors.js';

// ── Helpers ───────────────────────────────────────────────────

const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

export class ReelError extends ApiError {
  constructor(message, statusCode = 400) {
    super(message, statusCode);
    this.name = 'ReelError';
  }
}

const SAFE_LISTING_FIELDS = [
  'id',
  'title',
  'price',
  'currency',
  'status',
  'locationCity',
  'locationState',
];

const formatTaggedProduct = (item) => {
  const listing = item?.listing || item;
  if (!listing) return null;
  const safe = {};
  for (const key of SAFE_LISTING_FIELDS) {
    if (key in listing) safe[key] = listing[key];
  }
  return safe;
};

export const formatReel = (reel) => {
  if (!reel) return reel;
  const {
    _count,
    likes,
    savedBy,
    creator,
    mediaAsset,
    taggedProducts,
    videoStorageKey,
    thumbnailStorageKey,
    storageKey,
    thumbnailKey,
    uploadToken,
    mediaAssetId,
    deletedAt,
    ...rest
  } = reel;

  const rawTags = Array.isArray(taggedProducts) ? taggedProducts : [];
  const tags = rawTags.map(formatTaggedProduct).filter(Boolean);
  const primaryListing = tags[0] || null;

  const asset = mediaAsset || null;
  const rawStorageKey = asset?.storageKey || videoStorageKey || null;
  const rawThumbnailKey = asset?.thumbnailKey || thumbnailStorageKey || null;
  const isPoster = rawThumbnailKey && rawStorageKey && rawThumbnailKey === rawStorageKey;

  const videoUrl = rawStorageKey
    ? (rawStorageKey.startsWith('http') ? rawStorageKey : getSignedDeliveryUrl(rawStorageKey, 'video'))
    : null;

  const thumbnailUrl = rawThumbnailKey
    ? (rawThumbnailKey.startsWith('http')
        ? optimizeCloudinaryUrl(rawThumbnailKey)
        : (isPoster
            ? getSignedDeliveryUrl(rawThumbnailKey + '.jpg', 'video')
            : getSignedDeliveryUrl(rawThumbnailKey, 'image')))
    : (rawStorageKey
        ? (rawStorageKey.startsWith('http')
            ? optimizeCloudinaryUrl(rawStorageKey.replace(/.[^.]+$/, '.jpg'))
            : getSignedDeliveryUrl(rawStorageKey + '.jpg', 'video'))
        : null);

  const visibilityState = rest.visibilityState || (rest.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT');

  let safeMediaAsset = undefined;
  if (asset) {
    safeMediaAsset = {
      id: asset.id,
      processingState: asset.processingState,
      durationMs: asset.durationMs ?? null,
      width: asset.width ?? null,
      height: asset.height ?? null,
      mimeType: asset.mimeType ?? null,
      sizeBytes: asset.sizeBytes ?? null,
    };
  }

  return {
    ...rest,
    visibilityState,
    status: rest.status || visibilityState,
    title: reel.caption || primaryListing?.title || 'Product Reel',
    description: reel.caption,
    videoUrl,
    thumbnailUrl,
    likesCount: _count?.likes ?? (typeof rest.likesCount === 'number' ? rest.likesCount : 0),
    commentsCount: _count?.comments ?? (typeof rest.commentsCount === 'number' ? rest.commentsCount : 0),
    taggedProducts: tags,
    listing: primaryListing,
    ...(creator ? { creator: { ...creator, avatarUrl: creator.avatarUrl ? optimizeCloudinaryUrl(creator.avatarUrl) : null } } : {}),
    ...(likes !== undefined
      ? { isLiked: likes.length > 0 }
      : (reel.isLiked !== undefined ? { isLiked: !!reel.isLiked } : { isLiked: false })),
    ...(savedBy !== undefined
      ? { isSaved: savedBy.length > 0 }
      : (reel.isSaved !== undefined ? { isSaved: !!reel.isSaved } : { isSaved: false })),
    ...(safeMediaAsset ? { mediaAsset: safeMediaAsset } : {}),
  };
};

// ── Create ────────────────────────────────────────────────────

export const createReel = async (validatedBody, creatorId) => {
  if (validatedBody.listingId) {
    const listing = await repo.findListingById(validatedBody.listingId);
    if (!listing) {
      throw new NotFoundError('Linked listing not found');
    }
    const isOwner = await repo.verifyListingOwnership(validatedBody.listingId, creatorId);
    if (!isOwner) {
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

  const isOwner = userId && reel.creatorId === userId;
  if (!isOwner) {
    if (reel.visibilityState !== REEL_VISIBILITY_STATE.PUBLISHED && reel.status !== REEL_STATUS.PUBLISHED) {
      throw new NotFoundError(`Reel ${reelId} not found`);
    }
    if (reel.mediaAsset && reel.mediaAsset.processingState !== 'READY') {
      throw new NotFoundError(`Reel ${reelId} not found`);
    }
  }

  return formatReel(reel);
};

// ── List / Feed ───────────────────────────────────────────────

export const listReels = async (queryParams, userId = null) => {
  const isOwnerQuery = queryParams.creatorId && userId && queryParams.creatorId === userId;
  const targetVisibility = queryParams.visibilityState || (queryParams.status && queryParams.status !== 'ALL' ? (queryParams.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT') : undefined);

  const filters = {
    ...queryParams,
    userId,
    visibilityState: isOwnerQuery ? targetVisibility : (targetVisibility || 'PUBLISHED'),
    processingState: isOwnerQuery && targetVisibility && targetVisibility !== 'PUBLISHED' ? undefined : 'READY',
  };

  const result = await repo.listReels(filters);

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

  if (existing.visibilityState === REEL_VISIBILITY_STATE.ARCHIVED || existing.status === REEL_STATUS.ARCHIVED) {
    throw new ConflictError('Cannot update an archived Reel');
  }

  if (validatedBody.listingId) {
    const listing = await repo.findListingById(validatedBody.listingId);
    if (!listing) {
      throw new NotFoundError('Linked listing not found');
    }
    const isOwner = await repo.verifyListingOwnership(validatedBody.listingId, requestorCreatorId);
    if (!isOwner) {
      throw new ForbiddenError('You can only attach reels to your own product');
    }
  }

  const safeData = pick(validatedBody, [...REEL_UPDATABLE_FIELDS, 'status', 'visibilityState']);
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

  if (existing.visibilityState === REEL_VISIBILITY_STATE.ARCHIVED || existing.status === REEL_STATUS.ARCHIVED) {
    throw new ConflictError('Reel is already archived');
  }

  return repo.softDeleteReel(reelId);
};

// ── Request signed upload params ──────────────────────────────

export const requestUpload = async (reelId, creatorId, declaredMeta = {}) => {
  const existing = await repo.findReelById(reelId);
  if (!existing) {
    throw new NotFoundError(`Reel ${reelId} not found`);
  }
  if (existing.creatorId !== creatorId) {
    throw new ForbiddenError('You do not own this Reel');
  }
  if (existing.visibilityState === REEL_VISIBILITY_STATE.ARCHIVED || existing.status === REEL_STATUS.ARCHIVED) {
    throw new ConflictError('Cannot upload media for an archived Reel');
  }

  // Preliminary declared file size validation (max 500 MB)
  if (declaredMeta.fileSizeBytes && declaredMeta.fileSizeBytes > 500 * 1024 * 1024) {
    throw new ReelError('Declared file size exceeds the 500 MB limit', 422);
  }

  // Reuse existing mediaAssetId or generate uploadToken
  const uploadToken = existing.mediaAssetId || crypto.randomUUID();
  const folder = `reels/${creatorId}`;
  const publicId = `${folder}/${reelId}`;
  const context = `reelId=${reelId}|uploadToken=${uploadToken}|creatorId=${creatorId}`;

  // Call repository to persist upload session transactionally
  try {
    await repo.createOrUpdateUploadSession({
      reelId,
      creatorId,
      uploadToken,
      storageKey: publicId,
      fileSizeBytes: declaredMeta.fileSizeBytes || null,
      mimeType: declaredMeta.fileType || declaredMeta.mimeType || null,
    });
  } catch (dbErr) {
    if (dbErr instanceof ApiError) {
      throw dbErr;
    }
    throw new ApiError('Failed to initialize upload session in database', 500);
  }

  const signedPayload = generateUploadSignature({
    reelId,
    creatorId,
    uploadToken,
    folder,
    publicId,
    context,
  });

  return {
    ...signedPayload,
    uploadToken,
  };
};

// ── Confirm upload: store provisional client-declared metadata ─────────────────
// Cloudinary webhook remains authoritative for actual metadata and final processing state.

export const confirmUpload = async (reelId, mediaData, requestorCreatorId) => {
  const existing = await repo.findReelById(reelId);
  if (!existing) {
    throw new NotFoundError(`Reel ${reelId} not found`);
  }
  if (existing.creatorId !== requestorCreatorId) {
    throw new ForbiddenError('You do not own this Reel');
  }
  if (existing.visibilityState === REEL_VISIBILITY_STATE.ARCHIVED || existing.status === REEL_STATUS.ARCHIVED) {
    throw new ConflictError('Cannot confirm upload for an archived Reel');
  }

  // Validate that the upload session belongs to the reel and creator
  if (mediaData.uploadToken && existing.mediaAssetId && mediaData.uploadToken !== existing.mediaAssetId) {
    throw new ForbiddenError('Upload token does not match server session');
  }

  const updated = await repo.updateProvisionalMediaMetadata(reelId, mediaData);
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
