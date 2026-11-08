import { prisma } from '../../db/prisma.js';
import { AD_STATUS } from './advertisements.constants.js';
import { getPagination } from '../../utils/pagination.js';

export const createAdvertisement = (data) =>
  prisma.advertisement.create({
    data,
    include: {
      listing: { select: { id: true, title: true, status: true, price: true } },
      reel: { select: { id: true, caption: true } },
    },
  });

export const findAdvertisementById = (id) =>
  prisma.advertisement.findUnique({
    where: { id },
    include: {
      listing: { select: { id: true, title: true, status: true, price: true } },
      reel: { select: { id: true, caption: true } },
    },
  });

export const listAdvertisementsByOwner = async ({ ownerId, status, page = 1, limit = 20 }) => {
  const { skip, take } = getPagination({ page, limit }, { defaultLimit: 20, maxLimit: 100 });
  const where = {
    ownerId,
    ...(status ? { status } : {}),
  };

  const [ads, total] = await Promise.all([
    prisma.advertisement.findMany({
      where,
      include: {
        listing: { select: { id: true, title: true, status: true, price: true } },
        reel: { select: { id: true, caption: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.advertisement.count({ where }),
  ]);

  return { ads, total };
};

export const updateAdvertisementStatus = (id, status, stoppedAt = null) =>
  prisma.advertisement.update({
    where: { id },
    data: {
      status,
      stoppedAt,
    },
    include: {
      listing: { select: { id: true, title: true, status: true, price: true } },
      reel: { select: { id: true, caption: true } },
    },
  });

/**
 * Idempotent batch stop of campaigns associated with a specific listing.
 */
export const stopCampaignsForListing = async (listingId) => {
  const now = new Date();
  const result = await prisma.advertisement.updateMany({
    where: {
      OR: [
        { listingId },
        { targetType: 'LISTING', targetId: listingId },
      ],
      status: {
        in: [AD_STATUS.ACTIVE, AD_STATUS.PAUSED],
      },
    },
    data: {
      status: AD_STATUS.STOPPED,
      stoppedAt: now,
    },
  });

  return result.count;
};
