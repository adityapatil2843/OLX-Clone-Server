import { prisma } from '../../db/prisma.js';

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

export const listWishlistItems = async (userId, page, limit) => {
  page = page ?? 1;
  limit = limit ?? 20;
  const where = {
    userId,
    listing: { status: 'ACTIVE', deletedAt: null },
  };
  const [items, total] = await prisma.$transaction([
    prisma.wishlist.findMany({
      where,
      include: { listing: { include: listingInclude } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.wishlist.count({ where }),
  ]);
  return { items, total };
};
