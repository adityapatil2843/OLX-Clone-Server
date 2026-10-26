import crypto from 'node:crypto';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { generateListingUploadSignature, getListingMediaDeliveryUrl, uploadBufferToCloudinary } from '../reels/reels.storage.js';
import * as repo from './listings.repository.js';
import { validateCategoryAttributes } from '../categories/categories.service.js';
import { stopListingAdvertisements } from '../advertisements/advertisements.service.js';
import { LISTING_STATUS } from './listings.constants.js';

const withWishlistState = (listing) => {
  if (!listing) return listing;
  const { wishlistedBy, media = [], reels = [], ...data } = listing;
  return {
    ...data,
    media: media.map((item) => ({
      ...item,
      url: (item.thumbnailKey && item.thumbnailKey.startsWith('http'))
        ? item.thumbnailKey
        : getListingMediaDeliveryUrl(item.storageKey, item.type),
    })),
    reels: reels.map((r) => {
      const isPoster = r.thumbnailStorageKey && r.thumbnailStorageKey === r.videoStorageKey;
      return {
        ...r,
        videoUrl: r.videoStorageKey
          ? (r.videoStorageKey.startsWith('http') ? r.videoStorageKey : getListingMediaDeliveryUrl(r.videoStorageKey, 'VIDEO'))
          : null,
        thumbnailUrl: r.thumbnailStorageKey
          ? (r.thumbnailStorageKey.startsWith('http')
              ? r.thumbnailStorageKey
              : (isPoster
                  ? getListingMediaDeliveryUrl(r.thumbnailStorageKey + '.jpg', 'VIDEO')
                  : getListingMediaDeliveryUrl(r.thumbnailStorageKey, 'IMAGE')))
          : null,
      };
    }),
    ...(wishlistedBy ? { isWishlisted: wishlistedBy.length > 0 } : {}),
  };
};

const withPagination = (listings, total, page, limit) => ({
  data: listings.map(withWishlistState),
  meta: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
  },
});

export const createListing = async (payload, ownerId, files = []) => {
  const category = await repo.findActiveCategory(payload.categoryId);
  if (!category) throw new BadRequestError('Category does not exist or is inactive');

  // Validate submitted attributes against category schema if defined
  if (category.attributes) {
    validateCategoryAttributes(category.attributes, payload.attributes);
  }

  // Generate unique listingId in advance so Cloudinary folder is tied directly to this listing
  const listingId = crypto.randomUUID();

  // Extract separate media URL fields if provided in payload
  const { imageUrl, imageUrls, ...listingData } = payload;
  const mediaData = [];

  // 1. Process files uploaded directly with the listing (e.g. multipart/form-data)
  if (files && files.length > 0) {
    if (files.length > 12) {
      throw new BadRequestError('Maximum 12 media assets allowed per listing');
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isVideo = (file.mimetype || '').startsWith('video/');
      const mediaType = isVideo ? 'VIDEO' : 'IMAGE';
      const resourceType = isVideo ? 'video' : 'image';
      const folder = `listings/${ownerId}/${listingId}`;

      const uploaded = await uploadBufferToCloudinary(file.buffer, {
        resourceType,
        folder,
      });

      const secureUrl = uploaded.secure_url || getListingMediaDeliveryUrl(uploaded.public_id, mediaType);
      mediaData.push({
        type: mediaType,
        storageKey: uploaded.public_id,
        provider: 'cloudinary',
        thumbnailKey: secureUrl,
        displayOrder: mediaData.length,
      });
    }
  }

  // 2. Process image URLs passed in body (if any)
  const incomingUrls = [
    ...(imageUrl ? [imageUrl] : []),
    ...(Array.isArray(imageUrls) ? imageUrls : []),
  ];

  for (const url of incomingUrls) {
    if (mediaData.length >= 12) break;
    mediaData.push({
      type: 'IMAGE',
      storageKey: url,
      provider: 'cloudinary',
      thumbnailKey: url,
      displayOrder: mediaData.length,
    });
  }

  const createdListing = await repo.createListing(
    { ...listingData, id: listingId, ownerId },
    mediaData
  );

  return withWishlistState(createdListing);
};

export const getMyListings = async (ownerId, query) => {
  const result = await repo.listOwnedListings({ ownerId, ...query });
  return withPagination(result.listings, result.total, query.page, query.limit);
};

export const updateListing = async (id, payload, ownerId, userRole = 'USER') => {
  const listing = await repo.findOwnedListing(id, ownerId);
  if (!listing && userRole !== 'ADMIN') throw new NotFoundError('Listing not found');

  if (payload.categoryId) {
    const category = await repo.findActiveCategory(payload.categoryId);
    if (!category) throw new BadRequestError('Category does not exist or is inactive');
    if (payload.attributes) {
      validateCategoryAttributes(category.attributes, payload.attributes);
    }
  } else if (payload.attributes) {
    const currentListing = listing || (await repo.findListingById(id));
    if (currentListing?.category?.attributes) {
      validateCategoryAttributes(currentListing.category.attributes, payload.attributes);
    }
  }

  const updated = await repo.updateListing(id, payload);

  // If status is changed to SOLD or ARCHIVED, stop dependent advertising campaigns
  if (payload.status === LISTING_STATUS.SOLD || payload.status === LISTING_STATUS.ARCHIVED) {
    await stopListingAdvertisements(id);
  }

  return withWishlistState(updated);
};

export const updateListingStatus = async (id, status, ownerId, userRole = 'USER') => {
  const listing = await repo.findOwnedListing(id, ownerId);
  if (!listing && userRole !== 'ADMIN') throw new NotFoundError('Listing not found');

  const updated = await repo.updateListingStatus(id, status);

  // Flow E: When marked sold, automatically stop dependent advertising campaigns
  if (status === LISTING_STATUS.SOLD || status === LISTING_STATUS.ARCHIVED) {
    await stopListingAdvertisements(id);
  }

  return withWishlistState(updated);
};

export const deleteListing = async (id, ownerId, userRole = 'USER') => {
  const listing = await repo.findOwnedListing(id, ownerId);
  if (!listing && userRole !== 'ADMIN') throw new NotFoundError('Listing not found');
  await repo.archiveListing(id);
  await stopListingAdvertisements(id);
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

  const count = await repo.countMedia(listingId);
  if (count >= 12) {
    throw new BadRequestError('Maximum 12 media assets allowed per listing');
  }

  return generateListingUploadSignature({ listingId, ownerId, type: data.type });
};

export const attachMedia = async (listingId, ownerId, data) => {
  const listing = await repo.findOwnedListing(listingId, ownerId);
  if (!listing) throw new NotFoundError('Listing not found');
  if (listing.status === 'ARCHIVED') {
    throw new ForbiddenError('Cannot add media to an archived listing');
  }

  const count = await repo.countMedia(listingId);
  if (count >= 12) {
    throw new BadRequestError('Maximum 12 media assets allowed per listing');
  }

  return repo.createMedia(listingId, data);
};

export const uploadMediaDirect = async (listingId, ownerId, files, options = {}) => {
  const fileList = Array.isArray(files) ? files : (files ? [files] : []);
  if (fileList.length === 0) {
    throw new BadRequestError('No file provided for upload');
  }

  const listing = await repo.findOwnedListing(listingId, ownerId);
  if (!listing) throw new NotFoundError('Listing not found or access denied');
  if (listing.status === 'ARCHIVED') {
    throw new ForbiddenError('Cannot add media to an archived listing');
  }

  const currentCount = await repo.countMedia(listingId);
  if (currentCount + fileList.length > 12) {
    throw new BadRequestError(`Cannot exceed 12 media assets per listing. Current: ${currentCount}, attempting to add: ${fileList.length}`);
  }

  const createdItems = [];
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const isVideo = file.mimetype && file.mimetype.startsWith('video/');
    const mediaType = isVideo ? 'VIDEO' : 'IMAGE';
    const resourceType = isVideo ? 'video' : 'image';
    const folder = `listings/${ownerId}/${listingId}`;

    const uploaded = await uploadBufferToCloudinary(file.buffer, {
      resourceType,
      folder,
    });

    const secureUrl = uploaded.secure_url || getListingMediaDeliveryUrl(uploaded.public_id, mediaType);

    const created = await repo.createMedia(listingId, {
      type: mediaType,
      storageKey: uploaded.public_id,
      provider: 'cloudinary',
      thumbnailKey: secureUrl,
      displayOrder: options.displayOrder ? Number(options.displayOrder) + i : currentCount + i,
    });

    createdItems.push({
      ...created,
      url: secureUrl,
    });
  }

  return createdItems.length === 1 ? createdItems[0] : createdItems;
};

export const deleteMedia = async (listingId, mediaId, ownerId) => {
  const listing = await repo.findOwnedListing(listingId, ownerId);
  if (!listing) throw new NotFoundError('Listing not found or access denied');

  const media = await repo.findMediaById(listingId, mediaId);
  if (!media) throw new NotFoundError('Media asset not found');

  await repo.deleteMedia(mediaId);
  return { message: 'Media removed successfully', mediaId };
};


