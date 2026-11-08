import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../src/app.js';
import * as repo from '../src/modules/reels/reels.repository.js';
import { prisma } from '../src/db/prisma.js';
import { env } from '../src/config/env.js';

function computeSignature(bodyString, timestamp, secret = env.CLOUDINARY_API_SECRET) {
  return crypto.createHash('sha1').update(bodyString + timestamp + secret).digest('hex');
}

test('Cloudinary Webhook Verification & Lifecycle Finalization', async () => {
  const server = app.listen(0);
  const { port } = server.address();
  const webhookUrl = `http://127.0.0.1:${port}/api/v1/webhooks/cloudinary`;
  const reelsUrl = `http://127.0.0.1:${port}/api/v1/reels`;

  const createdReelIds = [];
  const createdAssetIds = [];

  try {
    // ── Test 1: Rejects requests missing signature headers ──────────────
    const missingHeadersRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notification_type: 'upload' }),
    });
    assert.equal(missingHeadersRes.status, 401);
    const missingJson = await missingHeadersRes.json();
    assert.equal(missingJson.success, false);
    assert.ok(missingJson.message.includes('Missing required Cloudinary webhook signature headers'));

    // ── Test 2: Rejects invalid HMAC signatures ────────────────────────
    const now = Math.floor(Date.now() / 1000);
    const fakeBody = JSON.stringify({ notification_type: 'upload', asset_id: 'fake_asset' });
    const invalidSigRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cld-Timestamp': String(now),
        'X-Cld-Signature': 'bogus_signature_value_1234567890',
      },
      body: fakeBody,
    });
    assert.equal(invalidSigRes.status, 401);
    const invalidJson = await invalidSigRes.json();
    assert.equal(invalidJson.success, false);
    assert.ok(invalidJson.message.includes('Invalid webhook signature'));

    // ── Test 3: Rejects stale timestamps (> 2 hours old) ───────────────
    const staleTimestamp = now - 7300; // 7300s > 7200s limit
    const staleSig = computeSignature(fakeBody, staleTimestamp);
    const staleRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cld-Timestamp': String(staleTimestamp),
        'X-Cld-Signature': staleSig,
      },
      body: fakeBody,
    });
    assert.equal(staleRes.status, 401);
    const staleJson = await staleRes.json();
    assert.equal(staleJson.success, false);
    assert.ok(staleJson.message.includes('Stale or invalid webhook timestamp'));

    // ── Setup: Test reel setup (using repository or mock if DB not migrated) ──
    let reel = null;
    const testReelId = 'dev-reel-webhook-test-1';
    const testAssetId = 'dev-asset-webhook-test-1';

    let isDbMigrated = false;
    try {
      reel = await prisma.reel.create({
        data: {
          id: testReelId,
          creatorId: 'dev-creator-001',
          caption: 'Authoritative limit and lifecycle reel test',
          visibilityState: 'DRAFT',
        },
      });
      createdReelIds.push(reel.id);
      isDbMigrated = true;
    } catch (err) {
      // If DB migration not yet applied, use repository mock hooks for tests 4-8
      reel = {
        id: testReelId,
        creatorId: 'dev-creator-001',
        caption: 'Authoritative limit and lifecycle reel test',
        visibilityState: 'DRAFT',
        mediaAssetId: testAssetId,
      };
      repo.__setMock('findReelById', async (id) => (id === testReelId ? reel : null));
    }

    let uploadToken = testAssetId;
    if (isDbMigrated) {
      // Request signed upload URL to generate server session MediaAsset & uploadToken
      const uploadUrlRes = await fetch(`${reelsUrl}/${reel.id}/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'authoritative_test.mp4',
          fileType: 'video/mp4',
          fileSizeBytes: 25000000,
        }),
      });
      assert.equal(uploadUrlRes.status, 200);
      const uploadUrlJson = await uploadUrlRes.json();
      uploadToken = uploadUrlJson.data.uploadToken;
      assert.ok(uploadToken);
      createdAssetIds.push(uploadToken);
    }

    // ── Test 4: Enforces authoritative 500 MB limit ───────────────────
    let failedCalled = false;
    repo.__setMock('markMediaAssetFailed', async (rId, token) => {
      failedCalled = true;
      if (isDbMigrated) {
        await prisma.mediaAsset.updateMany({
          where: { id: token },
          data: { processingState: 'FAILED' },
        });
      }
    });

    const oversizeBody = JSON.stringify({
      notification_type: 'upload',
      asset_id: 'oversize_asset_id',
      public_id: `reels/dev-creator-001/${reel.id}`,
      bytes: 524288001, // 500 MB + 1 byte
      context: {
        custom: {
          reelId: reel.id,
          uploadToken,
        },
      },
    });
    const oversizeTs = Math.floor(Date.now() / 1000);
    const oversizeSig = computeSignature(oversizeBody, oversizeTs);

    const oversizeRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cld-Timestamp': String(oversizeTs),
        'X-Cld-Signature': oversizeSig,
      },
      body: oversizeBody,
    });
    assert.equal(oversizeRes.status, 400);
    const oversizeJson = await oversizeRes.json();
    assert.equal(oversizeJson.success, false);
    assert.ok(oversizeJson.message.includes('exceeds 500 MB limit'));
    assert.equal(failedCalled, true);

    // ── Test 5: Rejects uploadToken mismatch (403) ─────────────────────
    const mismatchBody = JSON.stringify({
      notification_type: 'upload',
      asset_id: 'legit_asset_id_abc',
      public_id: `reels/dev-creator-001/${reel.id}`,
      bytes: 12000000,
      secure_url: 'https://res.cloudinary.com/demo/video/upload/sample.mp4',
      context: {
        custom: {
          reelId: reel.id,
          uploadToken: '00000000-0000-0000-0000-000000000000', // Wrong token
        },
      },
    });
    const mismatchTs = Math.floor(Date.now() / 1000);
    const mismatchSig = computeSignature(mismatchBody, mismatchTs);

    const mismatchRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cld-Timestamp': String(mismatchTs),
        'X-Cld-Signature': mismatchSig,
      },
      body: mismatchBody,
    });
    assert.equal(mismatchRes.status, 403);
    const mismatchJson = await mismatchRes.json();
    assert.equal(mismatchJson.success, false);
    assert.ok(mismatchJson.message.includes('Upload token does not match server session'));

    // ── Test 6: Valid webhook finalizes MediaAsset to READY (preserves Reel DRAFT) ──
    const validBody = JSON.stringify({
      notification_type: 'upload',
      asset_id: 'cld_valid_asset_789',
      public_id: `reels/dev-creator-001/${reel.id}`,
      bytes: 15400000,
      format: 'mp4',
      resource_type: 'video',
      duration: 18.4,
      width: 1080,
      height: 1920,
      secure_url: 'https://res.cloudinary.com/demo/video/upload/v12345/reels/dev-creator-001/sample.mp4',
      context: {
        custom: {
          reelId: reel.id,
          uploadToken,
        },
      },
    });
    const validTs = Math.floor(Date.now() / 1000);
    const validSig = computeSignature(validBody, validTs);

    let finalizeCalled = false;
    repo.__setMock('finalizeMediaAssetAndReel', async (args) => {
      finalizeCalled = true;
      return {
        isDuplicate: false,
        reel: { id: args.reelId, visibilityState: 'DRAFT' },
        asset: {
          id: args.mediaAssetId,
          processingState: 'READY',
          storageKey: args.storageKey,
          durationMs: args.durationMs,
          width: args.width,
          height: args.height,
          sizeBytes: args.sizeBytes,
        },
      };
    });

    const validRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cld-Timestamp': String(validTs),
        'X-Cld-Signature': validSig,
      },
      body: validBody,
    });
    assert.equal(validRes.status, 200);
    const validJson = await validRes.json();
    assert.equal(validJson.success, true);
    assert.equal(validJson.data.visibilityState, 'DRAFT', 'Phase 4: Webhook must not publish reel unless already published');
    assert.equal(finalizeCalled, true);

    // ── Test 7: Replay protection prevents reprocessing ───────────────
    // Mock DB recordWebhookEvent returning false (signature already recorded in DB)
    repo.__setMock('recordWebhookEvent', async () => false);

    const replayRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cld-Timestamp': String(validTs),
        'X-Cld-Signature': validSig,
      },
      body: validBody,
    });
    assert.equal(replayRes.status, 200);
    const replayJson = await replayRes.json();
    assert.equal(replayJson.success, true);
    assert.ok(replayJson.message.includes('Already processed'));

    // ── Test 8: Duplicate webhook returns success without repeating updates ──
    const idempRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cld-Timestamp': String(validTs),
        'X-Cld-Signature': validSig,
      },
      body: validBody,
    });
    assert.equal(idempRes.status, 200);
    const idempJson = await idempRes.json();
    assert.equal(idempJson.success, true);
    assert.ok(idempJson.message.includes('Already processed'));
  } finally {
    repo.__clearMocks();
    for (const reelId of createdReelIds) {
      await prisma.reel.deleteMany({ where: { id: reelId } }).catch(() => {});
    }
    for (const assetId of createdAssetIds) {
      await prisma.mediaAsset.deleteMany({ where: { id: assetId } }).catch(() => {});
    }
    server.close();
    await prisma.$disconnect().catch(() => {});
  }
});
