import { prisma } from '../../db/prisma.js';
import { AD_STATUS } from './advertisements.constants.js';

export const createAdvertisement = (data) =>
  prisma.advertisement.create({
    data,
    include: {
      listing: { select: { id: true, title: true, status: true, price: true } },
      reel: { select: { id: true, caption: true, status: true } },
    },
  });

export const findAdvertisementById = (id) =>
  prisma.advertisement.findUnique({
    where: { id },
    include: {
      listing: { select: { id: true, title: true, status: true, price: true } },
      reel: { select: { id: true, caption: true, status: true } },
    },
  });

export const listAdvertisementsByOwner = async ({ ownerId, status, page = 1, limit = 20 }) => {
  const where = {
    ownerId,
    ...(status ? { status } : {}),
  };

  const [ads, total] = await prisma.$transaction([
    prisma.advertisement.findMany({
      where,
      include: {
        listing: { select: { id: true, title: true, status: true, price: true } },
        reel: { select: { id: true, caption: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
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
      reel: { select: { id: true, caption: true, status: true } },
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
