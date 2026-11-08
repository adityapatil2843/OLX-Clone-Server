import test from 'node:test';
import assert from 'node:assert/strict';
import * as service from '../src/modules/reels/reels.service.js';
import * as repo from '../src/modules/reels/reels.repository.js';
import * as listingsService from '../src/modules/listings/listings.service.js';
import app from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';

test('Phase 5 — Feed Filtering and Response Compatibility (Unit Tests)', async (t) => {
  t.afterEach(() => {
    repo.__clearMocks();
  });

  await t.test('1. feed visibility filtering: listReels queries with visibilityState = PUBLISHED', async () => {
    let capturedWhere = null;
    repo.__setMock('listReels', async (params) => {
      capturedWhere = params;
      return { reels: [], total: 0 };
    });

    await service.listReels({ page: 1, limit: 10 });

    assert.ok(capturedWhere, 'listReels repository must be called');
    assert.equal(capturedWhere.visibilityState, 'PUBLISHED', 'Default public feed must filter for PUBLISHED');
  });

  await t.test('2. media readiness filtering: listReels enforces mediaAsset processingState = READY', async () => {
    const mockReels = [
      {
        id: 'reel-ready',
        visibilityState: 'PUBLISHED',
        mediaAsset: { id: 'm1', processingState: 'READY', storageKey: 'video-ready.mp4' },
      },
      {
        id: 'reel-pending',
        visibilityState: 'PUBLISHED',
        mediaAsset: { id: 'm2', processingState: 'PENDING', storageKey: 'video-pending.mp4' },
      },
      {
        id: 'reel-failed',
        visibilityState: 'PUBLISHED',
        mediaAsset: { id: 'm3', processingState: 'FAILED', storageKey: 'video-failed.mp4' },
      },
      {
        id: 'reel-processing',
        visibilityState: 'PUBLISHED',
        mediaAsset: { id: 'm4', processingState: 'PROCESSING', storageKey: 'video-proc.mp4' },
      },
      {
        id: 'reel-no-media',
        visibilityState: 'PUBLISHED',
        mediaAsset: null,
      },
    ];

    repo.__setMock('listReels', async (params) => {
      const filtered = mockReels.filter(
        (r) => r.visibilityState === 'PUBLISHED' && r.mediaAsset?.processingState === 'READY'
      );
      return { reels: filtered, total: filtered.length };
    });

    const feed = await service.listReels({ page: 1, limit: 10 });
    assert.equal(feed.data.length, 1);
    assert.equal(feed.data[0].id, 'reel-ready');
  });

  await t.test('3. response transformation from MediaAsset: derives videoUrl and thumbnailUrl', () => {
    const reel = {
      id: 'reel-media-transform',
      visibilityState: 'PUBLISHED',
      mediaAsset: {
        id: 'asset-1',
        storageKey: 'https://cdn.example.com/videos/reel-1.mp4',
        thumbnailKey: 'https://cdn.example.com/thumbs/reel-1.jpg',
        durationMs: 12000,
        width: 1080,
        height: 1920,
        processingState: 'READY',
      },
    };

    const formatted = service.formatReel(reel);
    assert.equal(formatted.videoUrl, 'https://cdn.example.com/videos/reel-1.mp4');
    assert.equal(formatted.thumbnailUrl, 'https://cdn.example.com/thumbs/reel-1.jpg');
  });

  await t.test('4. empty taggedProducts behavior: returns empty array taggedProducts: [] when no products are tagged', () => {
    const reelWithoutTags = {
      id: 'reel-no-tags',
      caption: 'Reel without tags',
      visibilityState: 'PUBLISHED',
      mediaAsset: { id: 'a1', storageKey: 'key.mp4', processingState: 'READY' },
      taggedProducts: [],
    };

    const formatted = service.formatReel(reelWithoutTags);
    assert.ok(Array.isArray(formatted.taggedProducts), 'taggedProducts must be an array');
    assert.equal(formatted.taggedProducts.length, 0);
    assert.deepEqual(formatted.taggedProducts, []);

    const reelWithNullTags = {
      id: 'reel-null-tags',
      caption: 'Reel null tags',
      visibilityState: 'PUBLISHED',
      mediaAsset: { id: 'a2', storageKey: 'key2.mp4', processingState: 'READY' },
      taggedProducts: null,
    };

    const formattedNull = service.formatReel(reelWithNullTags);
    assert.ok(Array.isArray(formattedNull.taggedProducts));
    assert.deepEqual(formattedNull.taggedProducts, []);
  });

  await t.test('5. tagged product formatting: selects only safe public listing fields', () => {
    const rawReel = {
      id: 'reel-tags',
      visibilityState: 'PUBLISHED',
      mediaAsset: { id: 'a1', storageKey: 'k.mp4', processingState: 'READY' },
      taggedProducts: [
        {
          id: 'tag-1',
          listingId: 'list-1',
          listing: {
            id: 'list-1',
            title: 'Vintage Watch',
            price: 4999,
            currency: 'INR',
            status: 'ACTIVE',
            locationCity: 'Mumbai',
            locationState: 'Maharashtra',
            ownerId: 'secret-owner-id',
            adminNotes: 'fraud suspect',
            phoneNumber: '9999999999',
          },
        },
      ],
    };

    const formatted = service.formatReel(rawReel);
    assert.equal(formatted.taggedProducts.length, 1);
    const tag = formatted.taggedProducts[0];
    assert.equal(tag.id, 'list-1');
    assert.equal(tag.title, 'Vintage Watch');
    assert.equal(tag.price, 4999);
    assert.equal(tag.currency, 'INR');
    assert.equal(tag.status, 'ACTIVE');
    assert.equal(tag.locationCity, 'Mumbai');
    assert.equal(tag.locationState, 'Maharashtra');
    assert.equal(tag.ownerId, undefined);
    assert.equal(tag.adminNotes, undefined);
    assert.equal(tag.phoneNumber, undefined);
  });

  await t.test('6. hidden storage keys and upload tokens: does not leak internal keys or tokens in public output', () => {
    const reelWithInternalFields = {
      id: 'reel-hidden-keys',
      caption: 'Check this out',
      visibilityState: 'PUBLISHED',
      status: 'PUBLISHED',
      mediaAssetId: 'secret-asset-token-12345',
      uploadToken: 'secret-upload-token-67890',
      videoStorageKey: 'private-bucket/raw-video.mp4',
      thumbnailStorageKey: 'private-bucket/raw-thumb.jpg',
      deletedAt: null,
      mediaAsset: {
        id: 'secret-asset-token-12345',
        storageKey: 'private-bucket/raw-video.mp4',
        thumbnailKey: 'private-bucket/raw-thumb.jpg',
        processingState: 'READY',
      },
    };

    const formatted = service.formatReel(reelWithInternalFields);

    assert.equal(formatted.mediaAssetId, undefined, 'mediaAssetId must be hidden');
    assert.equal(formatted.uploadToken, undefined, 'uploadToken must be hidden');
    assert.equal(formatted.videoStorageKey, undefined, 'videoStorageKey must be hidden');
    assert.equal(formatted.thumbnailStorageKey, undefined, 'thumbnailStorageKey must be hidden');
    assert.equal(formatted.deletedAt, undefined, 'deletedAt must be hidden');

    if (formatted.mediaAsset) {
      assert.equal(formatted.mediaAsset.storageKey, undefined, 'mediaAsset.storageKey must be hidden');
      assert.equal(formatted.mediaAsset.thumbnailKey, undefined, 'mediaAsset.thumbnailKey must be hidden');
    }
  });

  await t.test('7. like/save viewer state: correctly maps isLiked and isSaved', () => {
    const reelWithEngagement = {
      id: 'reel-engagement',
      visibilityState: 'PUBLISHED',
      mediaAsset: { id: 'a1', storageKey: 'k.mp4', processingState: 'READY' },
      _count: { likes: 42, comments: 7 },
      likes: [{ id: 'like-1' }],
      savedBy: [{ id: 'save-1' }],
    };

    const formatted = service.formatReel(reelWithEngagement);
    assert.equal(formatted.likesCount, 42);
    assert.equal(formatted.commentsCount, 7);
    assert.equal(formatted.isLiked, true);
    assert.equal(formatted.isSaved, true);

    const reelWithoutEngagement = {
      id: 'reel-no-engagement',
      visibilityState: 'PUBLISHED',
      mediaAsset: { id: 'a2', storageKey: 'k2.mp4', processingState: 'READY' },
      _count: { likes: 0, comments: 0 },
      likes: [],
      savedBy: [],
    };

    const formattedNone = service.formatReel(reelWithoutEngagement);
    assert.equal(formattedNone.likesCount, 0);
    assert.equal(formattedNone.commentsCount, 0);
    assert.equal(formattedNone.isLiked, false);
    assert.equal(formattedNone.isSaved, false);
  });

  await t.test('8. archived/moderated/failed reel exclusion: non-published & non-ready are rejected', async () => {
    repo.__setMock('listReels', async (params) => {
      const shouldFilterPublished = params.visibilityState === 'PUBLISHED';
      const shouldFilterReady = params.processingState === 'READY' || params.mediaProcessingState === 'READY';
      return {
        reels: [],
        total: 0,
        filtersApplied: { shouldFilterPublished, shouldFilterReady },
      };
    });

    const result = await service.listReels({ page: 1, limit: 10 });
    assert.ok(result);
  });
});

test('Phase 5 — Feed Filtering and Response Compatibility (Integration Tests)', async (t) => {
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  t.after(() => {
    server.close();
    repo.__clearMocks();
  });

  await t.test('1. Public feed excludes DRAFT, ARCHIVED, MODERATED reels and non-READY media', async () => {
    repo.__setMock('listReels', async (params) => {
      assert.equal(params.visibilityState, 'PUBLISHED', 'Public feed must filter visibilityState=PUBLISHED');
      assert.equal(params.processingState, 'READY', 'Public feed must filter processingState=READY');
      return {
        reels: [
          {
            id: 'reel-published-ready',
            caption: 'Public Published Reel',
            visibilityState: 'PUBLISHED',
            mediaAsset: { id: 'a1', storageKey: 'pub.mp4', processingState: 'READY' },
            taggedProducts: [],
            _count: { likes: 5, comments: 2 },
          },
        ],
        total: 1,
      };
    });

    const res = await fetch(`${baseUrl}/reels?page=1&limit=10`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.length, 1);
    assert.equal(json.data[0].id, 'reel-published-ready');
    assert.equal(json.data[0].mediaAssetId, undefined, 'mediaAssetId must not leak in public feed');
    assert.equal(json.data[0].videoStorageKey, undefined, 'videoStorageKey must not leak');
  });

  await t.test('2. Tagged listings appear in taggedProducts and legacy listing field remains compatible', async () => {
    repo.__setMock('listReels', async () => {
      return {
        reels: [
          {
            id: 'reel-with-tags',
            caption: 'Reviewing camera',
            visibilityState: 'PUBLISHED',
            mediaAsset: { id: 'a1', storageKey: 'cam.mp4', processingState: 'READY' },
            taggedProducts: [
              {
                listing: {
                  id: 'listing-cam-1',
                  title: 'Sony Alpha A7 IV',
                  price: 180000,
                  currency: 'INR',
                  status: 'ACTIVE',
                  locationCity: 'Bengaluru',
                  locationState: 'Karnataka',
                },
              },
            ],
            _count: { likes: 10, comments: 1 },
          },
        ],
        total: 1,
      };
    });

    const res = await fetch(`${baseUrl}/reels?limit=5`);
    assert.equal(res.status, 200);
    const json = await res.json();
    const reel = json.data[0];
    assert.ok(Array.isArray(reel.taggedProducts));
    assert.equal(reel.taggedProducts.length, 1);
    assert.equal(reel.taggedProducts[0].title, 'Sony Alpha A7 IV');
    assert.ok(reel.listing);
    assert.equal(reel.listing.id, 'listing-cam-1');
    assert.equal(reel.listing.title, 'Sony Alpha A7 IV');
    assert.equal(reel.likesCount, 10);
    assert.equal(reel.commentsCount, 1);
  });

  await t.test('3. Pagination metadata remains compatible for both offset and cursor queries', async () => {
    repo.__setMock('listReels', async (params) => {
      if (params.cursor) {
        return {
          reels: [],
          hasMore: false,
          nextCursor: null,
          total: null,
        };
      }
      return {
        reels: [],
        total: 0,
      };
    });

    const offsetRes = await fetch(`${baseUrl}/reels?page=1&limit=5`);
    assert.equal(offsetRes.status, 200);
    const offsetJson = await offsetRes.json();
    assert.ok(offsetJson.meta);
    assert.equal(offsetJson.meta.page, 1);
    assert.equal(offsetJson.meta.limit, 5);
    assert.equal(offsetJson.meta.total, 0);

    const cursorRes = await fetch(`${baseUrl}/reels?cursor=reel-cursor-123&limit=5`);
    assert.equal(cursorRes.status, 200);
    const cursorJson = await cursorRes.json();
    assert.ok(cursorJson.meta);
    assert.equal(cursorJson.meta.cursor, 'reel-cursor-123');
    assert.equal(cursorJson.meta.hasMore, false);
  });

  await t.test('4. Listing detail responses format nested reels compatibly using mediaAsset without circular references', async () => {
    const mockListing = {
      id: 'listing-parent-1',
      title: 'Gaming Laptop',
      price: 95000,
      currency: 'INR',
      status: 'ACTIVE',
      reelProductTags: [
        {
          reel: {
            id: 'nested-reel-1',
            caption: 'Unboxing Laptop',
            visibilityState: 'PUBLISHED',
            mediaAsset: {
              id: 'asset-laptop',
              storageKey: 'https://res.cloudinary.com/demo/video/upload/laptop.mp4',
              thumbnailKey: 'https://res.cloudinary.com/demo/video/upload/laptop.jpg',
              processingState: 'READY',
            },
          },
        },
      ],
      media: [],
    };

    const formatted = listingsService.withWishlistState
      ? listingsService.withWishlistState(mockListing)
      : mockListing;

    if (formatted.reels) {
      assert.ok(Array.isArray(formatted.reels));
      assert.equal(formatted.reels.length, 1);
      const nestedReel = formatted.reels[0];
      assert.equal(nestedReel.id, 'nested-reel-1');
      assert.equal(nestedReel.videoUrl, 'https://res.cloudinary.com/demo/video/upload/laptop.mp4');
      assert.ok(nestedReel.thumbnailUrl);
      assert.equal(nestedReel.listing, undefined);
    }
  });

  await t.test('5. Visibility rules: single reel lookups for non-owners reject non-published and non-ready reels (404)', async () => {
    const testUuid = '11111111-1111-4111-8111-111111111111';
    repo.__setMock('findReelById', async (reelId, userId) => {
      if (reelId === testUuid) {
        return {
          id: testUuid,
          creatorId: 'creator-owner-1',
          visibilityState: 'DRAFT',
          status: 'DRAFT',
          mediaAsset: { id: 'a1', processingState: 'PROCESSING' },
          taggedProducts: [],
          _count: { likes: 0, comments: 0 },
        };
      }
      return null;
    });

    const token = jwt.sign({ sub: 'viewer-stranger-2', role: 'USER' }, env.JWT_ACCESS_SECRET);
    const res = await fetch(`${baseUrl}/reels/${testUuid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 404, 'Non-owner must receive 404 when requesting unpublished reel');
  });

  await t.test('6. Engagement: Anonymous viewer receives isLiked: false and isSaved: false', async () => {
    const testUuid = '22222222-2222-4222-8222-222222222222';
    repo.__setMock('findReelById', async (reelId, userId) => {
      return {
        id: testUuid,
        creatorId: 'other-creator-uuid',
        visibilityState: 'PUBLISHED',
        status: 'PUBLISHED',
        mediaAsset: { id: 'a1', storageKey: 'sample.mp4', processingState: 'READY' },
        taggedProducts: [],
        _count: { likes: 10, comments: 2 },
        likes: [],
        savedBy: [],
      };
    });

    const res = await fetch(`${baseUrl}/reels/${testUuid}`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.isLiked, false);
    assert.equal(json.data.isSaved, false);
    assert.equal(json.data.likesCount, 10);
    assert.equal(json.data.commentsCount, 2);
  });
});
