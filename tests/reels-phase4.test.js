import test from 'node:test';
import assert from 'node:assert/strict';
import * as service from '../src/modules/reels/reels.service.js';
import * as repo from '../src/modules/reels/reels.repository.js';
import reelsRouter from '../src/modules/reels/reels.routes.js';
import { handleCloudinaryWebhook } from '../src/modules/reels/reels.webhook.js';
import { ApiError, ForbiddenError, NotFoundError, ConflictError } from '../src/utils/errors.js';
import { env } from '../src/config/env.js';
import crypto from 'node:crypto';

function computeSignature(bodyString, timestamp, secret = env.CLOUDINARY_API_SECRET) {
  return crypto.createHash('sha1').update(bodyString + timestamp + secret).digest('hex');
}

test('Phase 4 — Unified Upload Pipeline Unit & Integration Tests', async (t) => {
  t.afterEach(() => {
    repo.__clearMocks();
  });

  await t.test('1. Direct upload route POST /:reelId/upload and multipart middleware are removed', () => {
    const hasUploadRoute = reelsRouter.stack.some(
      (layer) => layer.route && layer.route.path === '/:reelId/upload'
    );
    assert.equal(hasUploadRoute, false, 'Route POST /:reelId/upload must be removed');

    assert.equal(
      typeof service.uploadReelDirect,
      'undefined',
      'uploadReelDirect must be removed from reels.service'
    );
  });

  await t.test('2. Standardize reel creation: transactional Reel (DRAFT) + MediaAsset (PENDING)', async () => {
    assert.equal(typeof repo.createReel, 'function');

    let createdAssetArgs = null;
    let createdReelArgs = null;

    repo.__setMock('createReel', async (data, creatorId) => {
      createdAssetArgs = {
        ownerId: creatorId,
        mediaType: 'VIDEO',
        purpose: 'REEL_VIDEO',
        processingState: 'PENDING',
        storageKey: '',
      };
      createdReelArgs = {
        ...data,
        creatorId,
        visibilityState: 'DRAFT',
        mediaAssetId: 'mock-asset-101',
      };
      return {
        id: 'mock-reel-101',
        ...createdReelArgs,
        mediaAsset: {
          id: 'mock-asset-101',
          ...createdAssetArgs,
        },
        taggedProducts: [],
        _count: { likes: 0, comments: 0 },
      };
    });

    const result = await service.createReel(
      { caption: 'TDD Standardized reel #test' },
      'creator-uuid-1'
    );

    assert.ok(createdAssetArgs, 'MediaAsset must be created');
    assert.equal(createdAssetArgs.processingState, 'PENDING');
    assert.equal(createdAssetArgs.ownerId, 'creator-uuid-1');

    assert.ok(createdReelArgs, 'Reel must be created');
    assert.equal(createdReelArgs.visibilityState, 'DRAFT');
    assert.equal(createdReelArgs.mediaAssetId, 'mock-asset-101');

    assert.equal(result.visibilityState, 'DRAFT');
    assert.equal(result.mediaAsset.processingState, 'PENDING');
    assert.equal(result.videoUrl, null);
    assert.equal(result.thumbnailUrl, null);
  });

  await t.test('3. Upload URL flow: ownership, state, session, and DB error handling', async () => {
    // 3a. Rejects non-existent reel with NotFoundError
    repo.__setMock('findReelById', async () => null);
    await assert.rejects(
      async () => {
        await service.requestUpload('reel-nonexistent', 'my-creator-id');
      },
      (err) => {
        assert.ok(err instanceof NotFoundError);
        return true;
      }
    );

    // 3b. Rejects non-owner with ForbiddenError
    repo.__setMock('findReelById', async () => ({
      id: 'reel-other-owner',
      creatorId: 'different-creator',
      visibilityState: 'DRAFT',
    }));
    await assert.rejects(
      async () => {
        await service.requestUpload('reel-other-owner', 'my-creator-id');
      },
      (err) => {
        assert.ok(err instanceof ForbiddenError);
        assert.equal(err.message, 'You do not own this Reel');
        return true;
      }
    );

    // 3c. Rejects ARCHIVED reel with ConflictError
    repo.__setMock('findReelById', async () => ({
      id: 'reel-archived',
      creatorId: 'my-creator-id',
      visibilityState: 'ARCHIVED',
    }));
    await assert.rejects(
      async () => {
        await service.requestUpload('reel-archived', 'my-creator-id');
      },
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.equal(err.message, 'Cannot upload media for an archived Reel');
        return true;
      }
    );

    // 3d. Rejects declared file size > 500 MB with 422
    repo.__setMock('findReelById', async () => ({
      id: 'reel-valid',
      creatorId: 'my-creator-id',
      visibilityState: 'DRAFT',
      mediaAssetId: 'existing-asset-id',
    }));
    await assert.rejects(
      async () => {
        await service.requestUpload('reel-valid', 'my-creator-id', {
          fileSizeBytes: 500 * 1024 * 1024 + 1,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 422);
        assert.ok(err.message.includes('500 MB limit'));
        return true;
      }
    );

    // 3e. Throws HTTP 500 ApiError when database initialization fails, never swallowing
    repo.__setMock('createOrUpdateUploadSession', async () => {
      throw new Error('Database connection failed');
    });
    await assert.rejects(
      async () => {
        await service.requestUpload('reel-valid', 'my-creator-id', {
          fileSizeBytes: 10000000,
        });
      },
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 500);
        assert.equal(err.message, 'Failed to initialize upload session in database');
        return true;
      }
    );

    // 3f. Successful session: sets processingState to PROCESSING and returns signed credentials
    let capturedSessionArgs = null;
    repo.__setMock('createOrUpdateUploadSession', async (args) => {
      capturedSessionArgs = args;
      return {
        id: args.uploadToken,
        processingState: 'PROCESSING',
      };
    });

    const uploadParams = await service.requestUpload('reel-valid', 'my-creator-id', {
      fileSizeBytes: 10000000,
      fileType: 'video/mp4',
    });

    assert.ok(uploadParams.uploadUrl);
    assert.ok(uploadParams.uploadToken);
    assert.ok(capturedSessionArgs);
    assert.equal(capturedSessionArgs.reelId, 'reel-valid');
    assert.equal(capturedSessionArgs.creatorId, 'my-creator-id');
  });

  await t.test('4. Confirm upload flow: persists provisional metadata without marking READY or PUBLISHED', async () => {
    // 4a. Rejects non-existent reel
    repo.__setMock('findReelById', async () => null);
    await assert.rejects(
      async () => {
        await service.confirmUpload('non-existent', {}, 'creator-1');
      },
      (err) => err instanceof NotFoundError
    );

    // 4b. Rejects non-owner
    repo.__setMock('findReelById', async () => ({
      id: 'reel-other',
      creatorId: 'someone-else',
      visibilityState: 'DRAFT',
    }));
    await assert.rejects(
      async () => {
        await service.confirmUpload('reel-other', {}, 'creator-1');
      },
      (err) => err instanceof ForbiddenError
    );

    // 4c. Rejects upload token mismatch
    repo.__setMock('findReelById', async () => ({
      id: 'reel-mismatch',
      creatorId: 'creator-1',
      visibilityState: 'DRAFT',
      mediaAssetId: 'expected-token-123',
    }));
    await assert.rejects(
      async () => {
        await service.confirmUpload(
          'reel-mismatch',
          { uploadToken: 'wrong-token-999' },
          'creator-1'
        );
      },
      (err) => {
        assert.ok(err instanceof ForbiddenError);
        assert.equal(err.message, 'Upload token does not match server session');
        return true;
      }
    );

    // 4d. Persists provisional metadata, does NOT mark READY, does NOT publish reel
    let capturedProvisional = null;
    repo.__setMock('findReelById', async () => ({
      id: 'reel-valid-draft',
      creatorId: 'creator-1',
      visibilityState: 'DRAFT',
      mediaAssetId: 'token-123',
    }));

    repo.__setMock('updateProvisionalMediaMetadata', async (reelId, declaredMeta) => {
      capturedProvisional = declaredMeta;
      return {
        id: reelId,
        creatorId: 'creator-1',
        visibilityState: 'DRAFT', // Remains DRAFT!
        mediaAssetId: 'token-123',
        mediaAsset: {
          id: 'token-123',
          processingState: 'PROCESSING', // Remains PROCESSING, NOT READY!
          mimeType: declaredMeta.mimeType,
          sizeBytes: declaredMeta.sizeBytes,
        },
        taggedProducts: [],
        _count: { likes: 0, comments: 0 },
      };
    });

    const confirmed = await service.confirmUpload(
      'reel-valid-draft',
      {
        uploadToken: 'token-123',
        mimeType: 'video/mp4',
        sizeBytes: 15400000,
        storageKey: 'provisional/path.mp4',
      },
      'creator-1'
    );

    assert.ok(capturedProvisional);
    assert.equal(capturedProvisional.mimeType, 'video/mp4');
    assert.equal(capturedProvisional.sizeBytes, 15400000);
    assert.equal(confirmed.visibilityState, 'DRAFT', 'Reel visibilityState must NOT change to PUBLISHED on confirm');
    assert.equal(confirmed.mediaAsset.processingState, 'PROCESSING', 'MediaAsset processingState must NOT be READY on confirm');
  });

  await t.test('5. Webhook processing: updates MediaAsset to READY, does not publish DRAFT reel, DB idempotency', async () => {
    let statusCode = null;
    let responseBody = null;
    const makeRes = () => ({
      status: (c) => {
        statusCode = c;
        return {
          json: (b) => {
            responseBody = b;
            return b;
          },
        };
      },
    });

    // 5a. Rejects missing headers with 401
    await handleCloudinaryWebhook({ headers: {}, body: '{}' }, makeRes());
    assert.equal(statusCode, 401);
    assert.equal(responseBody.success, false);

    // 5b. Replay idempotency: if signature already recorded in database, returns 200 without reprocessing
    repo.__setMock('recordWebhookEvent', async () => false); // Already processed!
    const replayBody = JSON.stringify({ notification_type: 'upload' });
    const replayTs = Math.floor(Date.now() / 1000);
    const replaySig = computeSignature(replayBody, replayTs);

    await handleCloudinaryWebhook(
      {
        headers: {
          'x-cld-timestamp': String(replayTs),
          'x-cld-signature': replaySig,
        },
        body: replayBody,
      },
      makeRes()
    );
    assert.equal(statusCode, 200);
    assert.equal(responseBody.success, true);
    assert.ok(responseBody.message.includes('Already processed'));

    // 5c. Oversized file (> 500 MB) marks MediaAsset as FAILED and returns 400 safely
    repo.__setMock('recordWebhookEvent', async () => true);
    let failedCalledWith = null;
    repo.__setMock('markMediaAssetFailed', async (reelId, token) => {
      failedCalledWith = { reelId, token };
    });

    const oversizeBody = JSON.stringify({
      notification_type: 'upload',
      bytes: 500 * 1024 * 1024 + 1,
      context: {
        custom: {
          reelId: 'reel-oversize-1',
          uploadToken: 'token-oversize-1',
        },
      },
    });
    const oversizeTs = Math.floor(Date.now() / 1000);
    const oversizeSig = computeSignature(oversizeBody, oversizeTs);

    await handleCloudinaryWebhook(
      {
        headers: {
          'x-cld-timestamp': String(oversizeTs),
          'x-cld-signature': oversizeSig,
        },
        body: oversizeBody,
      },
      makeRes()
    );
    assert.equal(statusCode, 400);
    assert.ok(responseBody.message.includes('exceeds 500 MB limit'));
    assert.deepEqual(failedCalledWith, { reelId: 'reel-oversize-1', token: 'token-oversize-1' });

    // 5d. Token mismatch returns 403
    repo.__setMock('findReelById', async () => ({
      id: 'reel-mismatch',
      mediaAssetId: 'expected-token',
    }));
    const mismatchBody = JSON.stringify({
      notification_type: 'upload',
      bytes: 100000,
      context: {
        custom: {
          reelId: 'reel-mismatch',
          uploadToken: 'wrong-token',
        },
      },
    });
    const mismatchTs = Math.floor(Date.now() / 1000);
    const mismatchSig = computeSignature(mismatchBody, mismatchTs);

    await handleCloudinaryWebhook(
      {
        headers: {
          'x-cld-timestamp': String(mismatchTs),
          'x-cld-signature': mismatchSig,
        },
        body: mismatchBody,
      },
      makeRes()
    );
    assert.equal(statusCode, 403);
    assert.equal(responseBody.success, false);
    assert.ok(responseBody.message.includes('Upload token does not match server session'));

    // 5e. Valid webhook: sets MediaAsset to READY, authoritative keys, preserves DRAFT on Reel
    let finalizedData = null;
    repo.__setMock('findReelById', async () => ({
      id: 'reel-valid',
      visibilityState: 'DRAFT',
      mediaAssetId: 'correct-token',
    }));
    repo.__setMock('finalizeMediaAssetAndReel', async (args) => {
      finalizedData = args;
      return {
        isDuplicate: false,
        reel: {
          id: args.reelId,
          visibilityState: 'DRAFT', // Remains DRAFT because it wasn't published yet!
        },
        asset: {
          id: args.mediaAssetId,
          processingState: 'READY',
          storageKey: args.storageKey,
          thumbnailKey: args.thumbnailKey,
          durationMs: args.durationMs,
          width: args.width,
          height: args.height,
          sizeBytes: args.sizeBytes,
          mimeType: args.mimeType,
        },
      };
    });

    const validBody = JSON.stringify({
      notification_type: 'upload',
      asset_id: 'cld-asset-999',
      public_id: 'reels/creator-1/reel-valid',
      bytes: 15400000,
      format: 'mp4',
      resource_type: 'video',
      duration: 15.5,
      width: 1080,
      height: 1920,
      secure_url: 'https://res.cloudinary.com/demo/video/upload/sample.mp4',
      context: {
        custom: {
          reelId: 'reel-valid',
          uploadToken: 'correct-token',
        },
      },
    });
    const validTs = Math.floor(Date.now() / 1000);
    const validSig = computeSignature(validBody, validTs);

    await handleCloudinaryWebhook(
      {
        headers: {
          'x-cld-timestamp': String(validTs),
          'x-cld-signature': validSig,
        },
        body: validBody,
      },
      makeRes()
    );

    assert.equal(statusCode, 200);
    assert.equal(responseBody.success, true);
    assert.equal(responseBody.data.visibilityState, 'DRAFT', 'Reel visibilityState must remain DRAFT');
    assert.ok(finalizedData);
    assert.equal(finalizedData.sizeBytes, 15400000);
    assert.equal(finalizedData.durationMs, 15500);
    assert.equal(finalizedData.width, 1080);
    assert.equal(finalizedData.height, 1920);
    assert.equal(finalizedData.mimeType, 'video/mp4');
    assert.equal(finalizedData.signature, validSig);
  });
});
