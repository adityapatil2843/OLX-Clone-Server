/**
 * Reels service — business rules live here.
 * Controllers call the service; the service calls the repository.
 */

import * as repo from './reels.repository.js';
import { generateUploadSignature, getSignedDeliveryUrl } from './reels.storage.js';
import { REEL_STATUS, REEL_UPDATABLE_FIELDS } from './reels.constants.js';

// ── Helpers ───────────────────────────────────────────────────

const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

import { ApiError } from '../../utils/errors.js';

// Custom error class — carries an HTTP status code
export class ReelError extends ApiError {
  constructor(message, statusCode = 400) {
    super(message, statusCode);
    this.name = 'ReelError';
  }
}

// ── Create ────────────────────────────────────────────────────

/**
 * @param {object} validatedBody  Output of createReelSchema.parse()
 * @param {string} creatorId
 */
export const createReel = async (validatedBody, creatorId) => {
  const reel = await repo.createReel(validatedBody, creatorId);
  return reel;
};

// ── Get one ───────────────────────────────────────────────────

export const getReelById = async (reelId) => {
  const reel = await repo.findReelById(reelId);
  if (!reel) {
    throw new ReelError(`Reel ${reelId} not found`, 404);
  }

  // Attach a short-lived delivery URL if media exists
  if (reel.videoStorageKey) {
    reel.videoUrl = getSignedDeliveryUrl(reel.videoStorageKey);
  }

  return reel;
};

// ── List ──────────────────────────────────────────────────────

export const listReels = async (queryParams) => {
  const { reels, total } = await repo.listReels(queryParams);
  const { page, limit } = queryParams;

  return {
    data: reels,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
    },
  };
};

// ── Update ────────────────────────────────────────────────────

export const updateReel = async (reelId, validatedBody, requestorCreatorId) => {
  const existing = await repo.findReelById(reelId);
  if (!existing) {
    throw new ReelError(`Reel ${reelId} not found`, 404);
  }

  // Ownership check (effective once auth is real)
  if (existing.creatorId !== requestorCreatorId) {
    throw new ReelError('You do not own this Reel', 403);
  }

  if (existing.status === REEL_STATUS.ARCHIVED) {
    throw new ReelError('Cannot update an archived Reel', 409);
  }

  // Only allow safe fields through
  const safeData = pick(validatedBody, REEL_UPDATABLE_FIELDS);
  return repo.updateReel(reelId, safeData);
};

// ── Soft-delete ───────────────────────────────────────────────

export const deleteReel = async (reelId, requestorCreatorId) => {
  const existing = await repo.findReelById(reelId);
  if (!existing) {
    throw new ReelError(`Reel ${reelId} not found`, 404);
  }

  if (existing.creatorId !== requestorCreatorId) {
    throw new ReelError('You do not own this Reel', 403);
  }

  if (existing.status === REEL_STATUS.ARCHIVED) {
    throw new ReelError('Reel is already archived', 409);
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
    throw new ReelError(`Reel ${reelId} not found`, 404);
  }
  if (existing.creatorId !== requestorCreatorId) {
    throw new ReelError('You do not own this Reel', 403);
  }
  if (existing.status !== REEL_STATUS.DRAFT && existing.status !== REEL_STATUS.FAILED) {
    throw new ReelError(
      `Cannot confirm upload for a Reel in status ${existing.status}`,
      409
    );
  }

  return repo.updateReelMedia(reelId, mediaData);
};
