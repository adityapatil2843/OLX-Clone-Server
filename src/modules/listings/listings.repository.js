import { prisma } from '../../db/prisma.js';
import { LISTING_STATUS } from './listings.constants.js';

const publicInclude = (userId) => ({
  category: { select: { id: true, name: true, slug: true } },
  owner: { select: { id: true, name: true, avatarUrl: true, isVerifiedSeller: true } },
  media: { orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] },
  ...(userId ? { wishlistedBy: { where: { userId }, select: { id: true } } } : {}),
});

export const findActiveCategory = (id) => prisma.category.findFirst({ where: { id, isActive: true } });

export const createListing = (data) => prisma.listing.create({
  data,
  include: publicInclude(),
});

export const findOwnedListing = (id, ownerId) => prisma.listing.findFirst({
  where: { id, ownerId, deletedAt: null },
  include: publicInclude(ownerId),
});

export const findPublicListing = (id, userId) => prisma.listing.findFirst({
  where: { id, status: LISTING_STATUS.ACTIVE, deletedAt: null },
  include: publicInclude(userId),
});

export const updateListing = (id, data) => prisma.listing.update({
  where: { id },
  data,
  include: publicInclude(),
});

export const archiveListing = (id) => prisma.listing.update({
  where: { id },
  data: { status: LISTING_STATUS.ARCHIVED, deletedAt: new Date() },
});

export const listOwnedListings = async ({ ownerId, status, page, limit }) => {
  page = page ?? 1;
  limit = limit ?? 20;
  const where = { ownerId, deletedAt: null, ...(status ? { status } : {}) };
  const [listings, total] = await prisma.$transaction([
    prisma.listing.findMany({ where, include: publicInclude(ownerId), orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.listing.count({ where }),
  ]);
  return { listings, total };
};

export const listPublicListings = async ({ categoryId, state, city, minPrice, maxPrice, page, limit, userId }) => {
  page = page ?? 1;
  limit = limit ?? 20;
  const where = {
    status: LISTING_STATUS.ACTIVE,
    deletedAt: null,
    ...(categoryId ? { categoryId } : {}),
    ...(state ? { locationState: { equals: state, mode: 'insensitive' } } : {}),
    ...(city ? { locationCity: { equals: city, mode: 'insensitive' } } : {}),
    ...(minPrice !== undefined || maxPrice !== undefined ? { price: { ...(minPrice !== undefined ? { gte: minPrice } : {}), ...(maxPrice !== undefined ? { lte: maxPrice } : {}) } } : {}),
  };
  const [listings, total] = await prisma.$transaction([
    prisma.listing.findMany({ where, include: publicInclude(userId), orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.listing.count({ where }),
  ]);
  return { listings, total };
};

export const createMedia = (listingId, data) => prisma.listingMedia.create({ data: { ...data, listingId } });
