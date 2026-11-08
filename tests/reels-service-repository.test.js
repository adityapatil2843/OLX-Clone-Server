import test from 'node:test';
import assert from 'node:assert/strict';
import * as service from '../src/modules/reels/reels.service.js';
import * as repo from '../src/modules/reels/reels.repository.js';
import { ApiError, ForbiddenError, NotFoundError, ConflictError } from '../src/utils/errors.js';

test('Reels Service & Repository — Unit Tests', async (t) => {
  await t.test('formatReel formats mediaAsset and taggedProducts correctly', () => {
    const rawReel = {
      id: 'reel-123',
      creatorId: 'creator-456',
      caption: 'Awesome test video #viral',
      visibilityState: 'PUBLISHED',
      mediaAsset: {
        id: 'asset-789',
        storageKey: 'https://res.cloudinary.com/demo/video/upload/sample.mp4',
        thumbnailKey: 'https://res.cloudinary.com/demo/video/upload/sample.jpg',
        durationMs: 15000,
        width: 1080,
        height: 1920,
        processingState: 'READY',
      },
      taggedProducts: [
        {
          id: 'tag-1',
          listingId: 'listing-100',
          listing: {
            id: 'listing-100',
            title: 'Tagged Product',
            price: 500,
            currency: 'INR',
          },
        },
      ],
      creator: {
        id: 'creator-456',
        name: 'Jane Doe',
        avatarUrl: null,
      },
      _count: {
        likes: 12,
        comments: 3,
      },
      likes: [{ id: 'like-1' }],
      savedBy: [],
    };

    const formatted = service.formatReel(rawReel);

    assert.equal(formatted.id, 'reel-123');
    assert.equal(formatted.visibilityState, 'PUBLISHED');
    assert.equal(formatted.status, 'PUBLISHED');
    assert.equal(formatted.title, 'Awesome test video #viral');
    assert.equal(formatted.videoUrl, 'https://res.cloudinary.com/demo/video/upload/sample.mp4');
    assert.equal(formatted.thumbnailUrl, 'https://res.cloudinary.com/demo/video/upload/f_auto,q_auto/sample.jpg');
    assert.equal(formatted.likesCount, 12);
    assert.equal(formatted.commentsCount, 3);
    assert.equal(formatted.isLiked, true);
    assert.equal(formatted.isSaved, false);
    assert.ok(Array.isArray(formatted.taggedProducts));
    assert.equal(formatted.taggedProducts.length, 1);
    assert.equal(formatted.taggedProducts[0].title, 'Tagged Product');
    assert.equal(formatted.listing.id, 'listing-100');
  });

  await t.test('formatReel handles missing media and tags gracefully', () => {
    const rawReel = {
      id: 'reel-empty',
      creatorId: 'creator-1',
      caption: 'No media yet',
      visibilityState: 'DRAFT',
      mediaAsset: null,
      taggedProducts: [],
      creator: null,
      _count: { likes: 0, comments: 0 },
    };

    const formatted = service.formatReel(rawReel);
    assert.equal(formatted.id, 'reel-empty');
    assert.equal(formatted.visibilityState, 'DRAFT');
    assert.equal(formatted.status, 'DRAFT');
    assert.equal(formatted.videoUrl, null);
    assert.equal(formatted.thumbnailUrl, null);
    assert.equal(formatted.title, 'No media yet');
    assert.deepEqual(formatted.taggedProducts, []);
    assert.equal(formatted.listing, null);
  });

  await t.test('Repository exports all required methods', () => {
    assert.equal(typeof repo.findReelByIdAndCreator, 'function');
    assert.equal(typeof repo.findListingById, 'function');
    assert.equal(typeof repo.verifyListingOwnership, 'function');
    assert.equal(typeof repo.createOrUpdateUploadSession, 'function');
    assert.equal(typeof repo.linkMediaAssetToReel, 'function');
    assert.equal(typeof repo.updateMediaProcessingMetadata, 'function');
    assert.equal(typeof repo.createReelProductTag, 'function');
    assert.equal(typeof repo.listReelProductTags, 'function');
    assert.equal(typeof repo.loadTaggedListings, 'function');
    assert.equal(typeof repo.createReel, 'function');
    assert.equal(typeof repo.updateReel, 'function');
    assert.equal(typeof repo.updateReelStatus, 'function');
    assert.equal(typeof repo.softDeleteReel, 'function');
    assert.equal(typeof repo.updateReelMedia, 'function');
    assert.equal(typeof repo.listComments, 'function');
  });
});
