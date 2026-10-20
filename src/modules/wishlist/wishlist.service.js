import { ConflictError, NotFoundError } from '../../utils/errors.js';
import { getListingMediaDeliveryUrl } from '../reels/reels.storage.js';
import * as listingRepo from '../listings/listings.repository.js';
import * as repo from './wishlist.repository.js';

export const addToWishlist = async (userId, listingId) => {
  const listing = await listingRepo.findPublicListing(listingId);
  if (!listing) throw new NotFoundError('Active listing not found');
  const existing = await repo.findWishlistItem(userId, listingId);
  if (existing) throw new ConflictError('Listing is already in your wishlist');
  return repo.addWishlistItem(userId, listingId);
};

export const removeFromWishlist = async (userId, listingId) => {
  const existing = await repo.findWishlistItem(userId, listingId);
  if (!existing) throw new NotFoundError('Wishlist item not found');
  await repo.removeWishlistItem(userId, listingId);
};

export const getWishlist = async (userId, { page, limit }) => {
  const { items, total } = await repo.listWishlistItems(userId, page, limit);
  return {
    data: items.map(({ listing, ...item }) => ({
      ...listing,
      media: listing.media.map((media) => ({ ...media, url: getListingMediaDeliveryUrl(media.storageKey, media.type) })),
      savedAt: item.createdAt,
    })),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasNextPage: page * limit < total },
  };
};
