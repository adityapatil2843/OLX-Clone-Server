import { prisma } from '../../db/prisma.js';
import { LISTING_STATUS } from './listings.constants.js';

const publicInclude = (userId) => ({
  category: { select: { id: true, name: true, slug: true, attributes: true } },
  owner: { select: { id: true, name: true, avatarUrl: true, isVerifiedSeller: true } },
  media: { orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] },
  ...(userId ? { wishlistedBy: { where: { userId }, select: { id: true } } } : {}),
});

export const findActiveCategory = (id) =>
  prisma.category.findFirst({ where: { id, isActive: true } });

export const createListing = (data, mediaData = []) =>
  prisma.listing.create({
    data: {
      ...data,
      ...(mediaData && mediaData.length > 0
        ? {
            media: {
              create: mediaData,
            },
          }
        : {}),
    },
    include: publicInclude(),
  });

export const findOwnedListing = (id, ownerId) =>
  prisma.listing.findFirst({
    where: { id, ownerId, deletedAt: null },
    include: publicInclude(ownerId),
  });

export const findListingById = (id) =>
  prisma.listing.findFirst({
    where: { id, deletedAt: null },
    include: publicInclude(),
  });

export const findPublicListing = (id, userId) =>
  prisma.listing.findFirst({
    where: { id, status: LISTING_STATUS.ACTIVE, deletedAt: null },
    include: publicInclude(userId),
  });

export const updateListing = (id, data) =>
  prisma.listing.update({
    where: { id },
    data,
    include: publicInclude(),
  });

export const updateListingStatus = (id, status) =>
  prisma.listing.update({
    where: { id },
    data: {
      status,
      ...(status === LISTING_STATUS.ARCHIVED ? { deletedAt: new Date() } : {}),
    },
    include: publicInclude(),
  });

export const archiveListing = (id) =>
  prisma.listing.update({
    where: { id },
    data: { status: LISTING_STATUS.ARCHIVED, deletedAt: new Date() },
  });

export const listOwnedListings = async ({ ownerId, status, page, limit }) => {
  page = page ?? 1;
  limit = limit ?? 20;
  const where = { ownerId, deletedAt: null, ...(status ? { status } : {}) };
  const [listings, total] = await prisma.$transaction([
    prisma.listing.findMany({
      where,
      include: publicInclude(ownerId),
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.listing.count({ where }),
  ]);
  return { listings, total };
};

/**
 * Calculates haversine distance in km between two lat/lon pairs in JavaScript.
 */
export const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const listPublicListings = async ({
  categoryId,
  state,
  city,
  minPrice,
  maxPrice,
  latitude,
  longitude,
  radius,
  search,
  sortBy = 'newest',
  page = 1,
  limit = 20,
  userId,
}) => {
  const where = {
    status: LISTING_STATUS.ACTIVE,
    deletedAt: null,
    ...(categoryId ? { categoryId } : {}),
    ...(state ? { locationState: { equals: state, mode: 'insensitive' } } : {}),
    ...(city ? { locationCity: { equals: city, mode: 'insensitive' } } : {}),
    ...(minPrice !== undefined || maxPrice !== undefined
      ? {
          price: {
            ...(minPrice !== undefined ? { gte: minPrice } : {}),
            ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { locationLocality: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  // If geospatial coordinates are passed
  const hasGeoQuery = latitude !== undefined && longitude !== undefined;

  let orderBy = { createdAt: 'desc' };
  if (sortBy === 'price_asc') {
    orderBy = { price: 'asc' };
  } else if (sortBy === 'price_desc') {
    orderBy = { price: 'desc' };
  }

  // Fetch candidate listings
  const candidates = await prisma.listing.findMany({
    where,
    include: publicInclude(userId),
    orderBy,
  });

  let filtered = candidates;

  if (hasGeoQuery) {
    const userLat = Number(latitude);
    const userLon = Number(longitude);
    const maxRadius = radius ? Number(radius) : Infinity;

    filtered = candidates
      .filter((item) => item.latitude !== null && item.longitude !== null)
      .map((item) => {
        const distanceKm = calculateDistanceKm(
          userLat,
          userLon,
          item.latitude,
          item.longitude
        );
        return {
          ...item,
          distanceKm: Number(distanceKm.toFixed(2)),
        };
      })
      .filter((item) => item.distanceKm <= maxRadius);

    if (sortBy === 'distance') {
      filtered.sort((a, b) => a.distanceKm - b.distanceKm);
    }
  }

  const total = filtered.length;
  const skip = (page - 1) * limit;
  const paginatedListings = filtered.slice(skip, skip + limit);

  return { listings: paginatedListings, total };
};

export const countMedia = (listingId) =>
  prisma.listingMedia.count({ where: { listingId } });

export const createMedia = (listingId, data) =>
  prisma.listingMedia.create({ data: { ...data, listingId } });
