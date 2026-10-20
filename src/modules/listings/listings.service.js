import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { generateListingUploadSignature, getListingMediaDeliveryUrl } from '../reels/reels.storage.js';
import * as repo from './listings.repository.js';

const withWishlistState = (listing) => {
  if (!listing) return listing;
  const { wishlistedBy, media = [], ...data } = listing;
  return {
    ...data,
    media: media.map((item) => ({ ...item, url: getListingMediaDeliveryUrl(item.storageKey, item.type) })),
    ...(wishlistedBy ? { isWishlisted: wishlistedBy.length > 0 } : {}),
  };
};

const withPagination = (listings, total, page, limit) => ({
  data: listings.map(withWishlistState),
  meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasNextPage: page * limit < total },
});

export const createListing = async (payload, ownerId) => {
  const category = await repo.findActiveCategory(payload.categoryId);
  if (!category) throw new BadRequestError('Category does not exist or is inactive');
  return withWishlistState(await repo.createListing({ ...payload, ownerId }));
};

export const getMyListings = async (ownerId, query) => {
  const result = await repo.listOwnedListings({ ownerId, ...query });
  return withPagination(result.listings, result.total, query.page, query.limit);
};

export const updateListing = async (id, payload, ownerId) => {
  const listing = await repo.findOwnedListing(id, ownerId);
  if (!listing) throw new NotFoundError('Listing not found');
  if (payload.categoryId) {
    const category = await repo.findActiveCategory(payload.categoryId);
    if (!category) throw new BadRequestError('Category does not exist or is inactive');
  }
  return withWishlistState(await repo.updateListing(id, payload));
};

export const deleteListing = async (id, ownerId) => {
  const listing = await repo.findOwnedListing(id, ownerId);
  if (!listing) throw new NotFoundError('Listing not found');
  await repo.archiveListing(id);
};

export const getPublicListings = async (query, userId) => {
  const result = await repo.listPublicListings({ ...query, userId });
  return withPagination(result.listings, result.total, query.page, query.limit);
};

export const getPublicListing = async (id, userId) => {
  const listing = await repo.findPublicListing(id, userId);
  if (!listing) throw new NotFoundError('Listing not found');
  return withWishlistState(listing);
};

export const requestMediaUpload = async (listingId, ownerId, data) => {
  const listing = await repo.findOwnedListing(listingId, ownerId);
  if (!listing) throw new NotFoundError('Listing not found');
  return generateListingUploadSignature({ listingId, ownerId, type: data.type });
};

export const attachMedia = async (listingId, ownerId, data) => {
  const listing = await repo.findOwnedListing(listingId, ownerId);
  if (!listing) throw new NotFoundError('Listing not found');
  if (listing.status === 'ARCHIVED') throw new ForbiddenError('Cannot add media to an archived listing');
  return repo.createMedia(listingId, data);
};
