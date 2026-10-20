import * as repo from './advertisements.repository.js';
import { prisma } from '../../db/prisma.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../utils/errors.js';
import { AD_STATUS, AD_TARGET_TYPE } from './advertisements.constants.js';

export const createAdvertisement = async (payload, ownerId) => {
  const { targetType, targetId, title, budget, endDate } = payload;

  let listingId = null;
  let reelId = null;

  if (targetType === AD_TARGET_TYPE.LISTING) {
    const listing = await prisma.listing.findUnique({
      where: { id: targetId },
    });

    if (!listing || listing.deletedAt) {
      throw new NotFoundError('Target listing not found');
    }

    if (listing.ownerId !== ownerId) {
      throw new ForbiddenError('You can only advertise your own listings');
    }

    if (listing.status !== 'ACTIVE') {
      throw new BadRequestError(`Cannot advertise a listing in status '${listing.status}'`);
    }

    listingId = targetId;
  } else if (targetType === AD_TARGET_TYPE.REEL) {
    const reel = await prisma.reel.findUnique({
      where: { id: targetId },
    });

    if (!reel || reel.deletedAt) {
      throw new NotFoundError('Target reel not found');
    }

    if (reel.creatorId !== ownerId) {
      throw new ForbiddenError('You can only advertise your own reels');
    }

    if (reel.status !== 'PUBLISHED') {
      throw new BadRequestError(`Cannot advertise a reel in status '${reel.status}'`);
    }

    reelId = targetId;
    if (reel.listingId) {
      listingId = reel.listingId;
    }
  }

  const ad = await repo.createAdvertisement({
    ownerId,
    targetType,
    targetId,
    title,
    budget,
    endDate,
    status: AD_STATUS.ACTIVE,
    listingId,
    reelId,
  });

  return ad;
};

export const getAdvertisement = async (id, ownerId, userRole = 'USER') => {
  const ad = await repo.findAdvertisementById(id);
  if (!ad) {
    throw new NotFoundError(`Advertisement '${id}' not found`);
  }

  if (ad.ownerId !== ownerId && userRole !== 'ADMIN' && userRole !== 'MODERATOR') {
    throw new ForbiddenError('You do not have permission to view this advertisement');
  }

  return ad;
};

export const listMyAdvertisements = async (ownerId, query) => {
  const { status, page = 1, limit = 20 } = query;
  const result = await repo.listAdvertisementsByOwner({
    ownerId,
    status,
    page,
    limit,
  });

  return {
    data: result.ads,
    meta: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
      hasNextPage: page * limit < result.total,
    },
  };
};

export const stopAdvertisement = async (id, ownerId, userRole = 'USER') => {
  const ad = await repo.findAdvertisementById(id);
  if (!ad) {
    throw new NotFoundError(`Advertisement '${id}' not found`);
  }

  if (ad.ownerId !== ownerId && userRole !== 'ADMIN') {
    throw new ForbiddenError('You do not have permission to stop this advertisement');
  }

  if (ad.status === AD_STATUS.STOPPED) {
    return ad; // Idempotent
  }

  return repo.updateAdvertisementStatus(id, AD_STATUS.STOPPED, new Date());
};

/**
 * Idempotently stops all active advertisements associated with a listing.
 * Automatically triggered when a listing is marked SOLD or ARCHIVED.
 *
 * @param {string} listingId
 * @returns {Promise<number>} Number of stopped campaigns
 */
export const stopListingAdvertisements = async (listingId) => {
  return repo.stopCampaignsForListing(listingId);
};
