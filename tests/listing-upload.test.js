import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { env } from '../src/config/env.js';

const generateToken = (user, role = 'USER') =>
  jwt.sign(
    { sub: user.id, role: user.role || role, email: user.email },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' }
  );

test('Listing Media Upload & Signed Direct Upload Flow', async (t) => {
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/v1/listings`;

  const suffix = `upload-test-${Date.now()}`;
  let owner, intruder, category, listing;

  try {
    owner = await prisma.user.create({
      data: { name: 'Owner User', email: `owner-${suffix}@example.com`, passwordHash: 'hash' },
    });
    intruder = await prisma.user.create({
      data: { name: 'Intruder User', email: `intruder-${suffix}@example.com`, passwordHash: 'hash' },
    });
    category = await prisma.category.create({
      data: { name: `Upload Cat ${suffix}`, slug: `upload-cat-${suffix}` },
    });
    listing = await prisma.listing.create({
      data: {
        title: 'Listing for Upload Testing',
        price: 25000,
        categoryId: category.id,
        ownerId: owner.id,
        contactPhone: '+919876543210',
      },
    });

    const ownerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${generateToken(owner)}`,
    };
    const intruderHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${generateToken(intruder)}`,
    };

    // 1. Authorized owner requests upload signature for valid image
    await t.test('1. Valid upload signature generation for listing image', async () => {
      const res = await fetch(`${baseUrl}/${listing.id}/media/upload-signature`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          type: 'IMAGE',
          fileName: 'car_front.jpg',
          fileType: 'image/jpeg',
          fileSizeBytes: 1024 * 1024,
        }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(json.data.uploadUrl);
      assert.ok(json.data.signature);
      assert.ok(json.data.publicId);
      assert.equal(json.data.resourceType, 'image');
      assert.ok(json.data.publicId.startsWith(`listings/${owner.id}/${listing.id}`));
    });

    // 2. Unauthorized request (invalid or expired token) returns 401
    await t.test('2. Unauthorized request returns 401', async () => {
      const res = await fetch(`${baseUrl}/${listing.id}/media/upload-signature`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid.token.value',
        },
        body: JSON.stringify({
          type: 'IMAGE',
          fileName: 'car.jpg',
          fileType: 'image/jpeg',
          fileSizeBytes: 1024 * 1024,
        }),
      });

      assert.equal(res.status, 401);
    });

    // 3. Wrong listing owner (intruder) returns 404
    await t.test('3. Wrong listing owner returns 404 Not Found', async () => {
      const res = await fetch(`${baseUrl}/${listing.id}/media/upload-signature`, {
        method: 'POST',
        headers: intruderHeaders,
        body: JSON.stringify({
          type: 'IMAGE',
          fileName: 'hack.jpg',
          fileType: 'image/jpeg',
          fileSizeBytes: 1024 * 1024,
        }),
      });

      assert.equal(res.status, 404);
    });

    // 4. Invalid MIME type is rejected with 422
    await t.test('4. Unsupported MIME type rejected with 422', async () => {
      const res = await fetch(`${baseUrl}/${listing.id}/media/upload-signature`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          type: 'IMAGE',
          fileName: 'malicious.pdf',
          fileType: 'application/pdf',
          fileSizeBytes: 1024 * 1024,
        }),
      });

      assert.equal(res.status, 422);
      const json = await res.json();
      assert.equal(json.success, false);
    });

    // 5. Oversized image (> 25MB) is rejected with 422
    await t.test('5. Oversized image (> 25MB) rejected with 422', async () => {
      const res = await fetch(`${baseUrl}/${listing.id}/media/upload-signature`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          type: 'IMAGE',
          fileName: 'huge_raw.jpg',
          fileType: 'image/jpeg',
          fileSizeBytes: 30 * 1024 * 1024, // 30 MB
        }),
      });

      assert.equal(res.status, 422);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.ok(JSON.stringify(json.error).includes('exceeds maximum allowed of 25 MB'));
    });

    // 6. Attach media directly to listing
    let createdMediaId;
    const testStorageKey = `listings/${owner.id}/${listing.id}/photo_${Date.now()}`;
    await t.test('6. Attach media to listing', async () => {
      const res = await fetch(`${baseUrl}/${listing.id}/media`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          type: 'IMAGE',
          storageKey: testStorageKey,
          provider: 'cloudinary',
          thumbnailKey: `https://res.cloudinary.com/${testStorageKey}.jpg`,
          displayOrder: 0,
        }),
      });

      assert.equal(res.status, 201);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.storageKey, testStorageKey);
      assert.equal(json.data.listingId, listing.id);
      createdMediaId = json.data.id;
    });

    // 7. Duplicate media prevention & Idempotency
    await t.test('7. Duplicate media attachment is idempotent and does not throw unique constraint error', async () => {
      const res = await fetch(`${baseUrl}/${listing.id}/media`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          type: 'IMAGE',
          storageKey: testStorageKey,
          provider: 'cloudinary',
          thumbnailKey: `https://res.cloudinary.com/${testStorageKey}.jpg`,
          displayOrder: 0,
        }),
      });

      assert.ok(res.status === 200 || res.status === 201);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.storageKey, testStorageKey);
    });

    // 8. Intruder rejected from attaching media
    await t.test('8. Intruder rejected from attaching media with 404', async () => {
      const res = await fetch(`${baseUrl}/${listing.id}/media`, {
        method: 'POST',
        headers: intruderHeaders,
        body: JSON.stringify({
          type: 'IMAGE',
          storageKey: `listings/intruder/${listing.id}/photo_bad`,
          provider: 'cloudinary',
          displayOrder: 1,
        }),
      });

      assert.equal(res.status, 404);
    });

    // 9. Enforce maximum file count limit (12 items)
    await t.test('9. Rejects media when listing limit of 12 items is reached', async () => {
      // Fill media up to 12
      const currentCount = await prisma.listingMedia.count({ where: { listingId: listing.id } });
      const fillData = [];
      for (let i = currentCount; i < 12; i++) {
        fillData.push({
          listingId: listing.id,
          type: 'IMAGE',
          storageKey: `fill-key-${i}-${suffix}`,
          provider: 'cloudinary',
          displayOrder: i,
        });
      }
      if (fillData.length > 0) {
        await prisma.listingMedia.createMany({ data: fillData });
      }

      // Now 13th media signature request must fail with 400
      const sigRes = await fetch(`${baseUrl}/${listing.id}/media/upload-signature`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          type: 'IMAGE',
          fileName: 'thirteenth.jpg',
          fileType: 'image/jpeg',
          fileSizeBytes: 1024,
        }),
      });
      assert.equal(sigRes.status, 400);
      const sigJson = await sigRes.json();
      assert.match(sigJson.error.message, /Maximum 12 media assets allowed/);

      // 13th attach request must also fail with 400
      const attachRes = await fetch(`${baseUrl}/${listing.id}/media`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          type: 'IMAGE',
          storageKey: `thirteenth-key-${suffix}`,
          provider: 'cloudinary',
          displayOrder: 13,
        }),
      });
      assert.equal(attachRes.status, 400);
    });

    // 10. Delete media asset
    await t.test('10. Owner can delete media asset and maintain relational integrity', async () => {
      const res = await fetch(`${baseUrl}/${listing.id}/media/${createdMediaId}`, {
        method: 'DELETE',
        headers: ownerHeaders,
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);

      // Verify removed from database
      const count = await prisma.listingMedia.count({ where: { id: createdMediaId } });
      assert.equal(count, 0);
    });

    // 11. Cannot attach media to archived listing
    await t.test('11. Cannot attach media to an archived listing', async () => {
      await prisma.listing.update({
        where: { id: listing.id },
        data: { status: 'ARCHIVED', deletedAt: null },
      });

      const res = await fetch(`${baseUrl}/${listing.id}/media`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          type: 'IMAGE',
          storageKey: `archived-key-${suffix}`,
          provider: 'cloudinary',
          displayOrder: 0,
        }),
      });

      assert.equal(res.status, 403);
      const json = await res.json();
      assert.match(json.error.message, /Cannot add media to an archived listing/);
    });
  } finally {
    if (listing) {
      await prisma.listingMedia.deleteMany({ where: { listingId: listing.id } }).catch(() => {});
      await prisma.listing.deleteMany({ where: { id: listing.id } }).catch(() => {});
    }
    if (category) await prisma.category.deleteMany({ where: { id: category.id } }).catch(() => {});
    if (owner) await prisma.user.deleteMany({ where: { id: owner.id } }).catch(() => {});
    if (intruder) await prisma.user.deleteMany({ where: { id: intruder.id } }).catch(() => {});
    server.close();
    await prisma.$disconnect().catch(() => {});
  }
});
