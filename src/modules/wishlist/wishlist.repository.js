import { prisma } from '../../db/prisma.js';
import { getPagination } from '../../utils/pagination.js';

const listingInclude = {
  category: { select: { id: true, name: true, slug: true } },
  owner: { select: { id: true, name: true, avatarUrl: true, isVerifiedSeller: true } },
  media: { orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] },
};

export const findWishlistItem = (userId, listingId) => prisma.wishlist.findUnique({
  where: { userId_listingId: { userId, listingId } },
});

export const addWishlistItem = (userId, listingId) => prisma.wishlist.create({
  data: { userId, listingId },
  include: { listing: { include: listingInclude } },
});

export const removeWishlistItem = (userId, listingId) => prisma.wishlist.delete({
  where: { userId_listingId: { userId, listingId } },
});

export const listWishlistItems = async (userId, page = 1, limit = 20) => {
  const { skip, take } = getPagination({ page, limit }, { defaultLimit: 20, maxLimit: 50 });
  const where = {
    userId,
    listing: { status: 'ACTIVE', deletedAt: null },
  };
  const [items, total] = await Promise.all([
    prisma.wishlist.findMany({
      where,
      include: { listing: { include: listingInclude } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.wishlist.count({ where }),
  ]);
  return { items, total };
};
