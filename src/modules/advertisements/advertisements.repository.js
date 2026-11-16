import { prisma } from '../../db/prisma.js';
import { AD_STATUS } from './advertisements.constants.js';
import { getPagination } from '../../utils/pagination.js';

const adInclude = {
  package: { select: { id: true, name: true, durationDays: true, coinsCost: true } },
  listing: { select: { id: true, title: true, status: true, price: true } },
  reel: { select: { id: true, caption: true, visibilityState: true } },
};

export const createAdvertisement = (data, dbClient = prisma) =>
  dbClient.advertisement.create({
    data,
    include: adInclude,
  });

export const findAdvertisementById = (id, dbClient = prisma) =>
  dbClient.advertisement.findUnique({
    where: { id },
    include: adInclude,
  });

export const findActiveBoostByTarget = (targetType, targetId, dbClient = prisma) => {
  const now = new Date();
  return dbClient.advertisement.findFirst({
    where: {
      targetType,
      targetId,
      status: AD_STATUS.ACTIVE,
      OR: [
        { endDate: null },
        { endDate: { gt: now } },
      ],
    },
    include: adInclude,
  });
};

export const listAdvertisementsByOwner = async ({ ownerId, status, page = 1, limit = 20 }) => {
  const { skip, take } = getPagination({ page, limit }, { defaultLimit: 20, maxLimit: 100 });
  const where = {
    ownerId,
    ...(status ? { status } : {}),
  };

  const [ads, total] = await Promise.all([
    prisma.advertisement.findMany({
      where,
      include: adInclude,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.advertisement.count({ where }),
  ]);

  return { ads, total };
};

export const updateAdvertisementStatus = (id, status, stoppedAt = null, dbClient = prisma) =>
  dbClient.advertisement.update({
    where: { id },
    data: {
      status,
      stoppedAt,
    },
    include: adInclude,
  });

export const cancelCampaignsForListing = async (listingId, dbClient = prisma) => {
  const now = new Date();
  const result = await dbClient.advertisement.updateMany({
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
      status: AD_STATUS.CANCELLED,
      stoppedAt: now,
    },
  });

  return result.count;
};

export const findEligibleSponsoredAdvertisements = async ({ targetType, limit = 10, dbClient = prisma }) => {
  const now = new Date();
  return dbClient.advertisement.findMany({
    where: {
      targetType,
      status: AD_STATUS.ACTIVE,
      endDate: { gt: now },
    },
    include: {
      listing: {
        where: { status: 'ACTIVE', deletedAt: null },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          owner: { select: { id: true, name: true, avatarUrl: true, isVerifiedSeller: true } },
          media: { orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] },
        },
      },
      reel: {
        where: { visibilityState: 'PUBLISHED', deletedAt: null },
        include: {
          creator: { select: { id: true, name: true, avatarUrl: true, isVerifiedSeller: true } },
          mediaAsset: true,
          taggedProducts: {
            include: {
              listing: {
                select: { id: true, title: true, price: true, currency: true, status: true },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
};
