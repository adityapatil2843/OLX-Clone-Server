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

test('Saved Reels API — Authentication, Scoping, Pagination & Router Precedence', async () => {
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/v1/reels`;
  const suffix = `saved-test-${Date.now()}`;

  let userA, userB;
  let reel1, reel2, archivedReel;

  try {
    // 1. Create test users
    userA = await prisma.user.create({
      data: {
        name: `User A ${suffix}`,
        email: `usera-${suffix}@example.com`,
        passwordHash: 'hashA',
      },
    });

    userB = await prisma.user.create({
      data: {
        name: `User B ${suffix}`,
        email: `userb-${suffix}@example.com`,
        passwordHash: 'hashB',
      },
    });

    const tokenA = generateToken(userA);
    const tokenB = generateToken(userB);

    // 2. Create test reels
    reel1 = await prisma.reel.create({
      data: {
        creatorId: userA.id,
        caption: `Published Reel 1 ${suffix}`,
        visibilityState: 'PUBLISHED',
      },
    });

    reel2 = await prisma.reel.create({
      data: {
        creatorId: userB.id,
        caption: `Published Reel 2 ${suffix}`,
        visibilityState: 'PUBLISHED',
      },
    });

    archivedReel = await prisma.reel.create({
      data: {
        creatorId: userB.id,
        caption: `Archived Reel ${suffix}`,
        visibilityState: 'ARCHIVED',
      },
    });

    // 3. Request with invalid token must return 401 Unauthorized
    const invalidAuthRes = await fetch(`${baseUrl}/saved`, {
      headers: { Authorization: 'Bearer invalid.token.payload' },
    });
    assert.equal(invalidAuthRes.status, 401, 'Invalid token must return 401 Unauthorized');

    // 4. Router precedence check: /saved must not return 404 or be captured as reelId "saved"
    const authHeadersA = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenA}`,
    };
    const emptySavedRes = await fetch(`${baseUrl}/saved`, { headers: authHeadersA });
    assert.equal(emptySavedRes.status, 200, 'GET /api/v1/reels/saved must return 200');
    const emptySavedJson = await emptySavedRes.json();
    assert.equal(emptySavedJson.success, true);
    assert.equal(emptySavedJson.data.length, 0);
    assert.equal(emptySavedJson.meta.total, 0);

    // 5. User A saves Reel 1 and Reel 2, and Archived Reel
    await prisma.savedReel.create({
      data: { userId: userA.id, reelId: reel1.id },
    });
    await prisma.savedReel.create({
      data: { userId: userA.id, reelId: reel2.id },
    });
    await prisma.savedReel.create({
      data: { userId: userA.id, reelId: archivedReel.id },
    });

    // User B saves only Reel 2
    await prisma.savedReel.create({
      data: { userId: userB.id, reelId: reel2.id },
    });

    // 6. User A lists saved reels:
    // Should return Reel 1 and Reel 2, but NOT Archived Reel (visibility filtering)
    const savedResA = await fetch(`${baseUrl}/saved`, { headers: authHeadersA });
    assert.equal(savedResA.status, 200);
    const savedJsonA = await savedResA.json();
    assert.equal(savedJsonA.success, true);
    assert.equal(savedJsonA.data.length, 2, 'Archived reel must not appear in saved reels');
    assert.equal(savedJsonA.meta.total, 2);
    assert.ok(savedJsonA.data.every((r) => r.isSaved === true));

    // Verify fields needed by mobile grid
    const sampleItem = savedJsonA.data[0];
    assert.ok(sampleItem.id);
    assert.ok(sampleItem.title);
    assert.ok(sampleItem.createdAt);
    assert.ok(sampleItem.savedAt);
    assert.equal(sampleItem.isSaved, true);

    // 7. User Scoping: User B should only see their own saved reel (Reel 2)
    const authHeadersB = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenB}`,
    };
    const savedResB = await fetch(`${baseUrl}/saved`, { headers: authHeadersB });
    assert.equal(savedResB.status, 200);
    const savedJsonB = await savedResB.json();
    assert.equal(savedJsonB.data.length, 1);
    assert.equal(savedJsonB.data[0].id, reel2.id);

    // 8. Pagination and bounded limits
    const page1Res = await fetch(`${baseUrl}/saved?page=1&limit=1`, { headers: authHeadersA });
    assert.equal(page1Res.status, 200);
    const page1Json = await page1Res.json();
    assert.equal(page1Json.data.length, 1);
    assert.equal(page1Json.meta.page, 1);
    assert.equal(page1Json.meta.limit, 1);
    assert.equal(page1Json.meta.total, 2);
    assert.equal(page1Json.meta.totalPages, 2);
    assert.equal(page1Json.meta.hasNextPage, true);

    // 9. Validation: limit > 50 must be rejected
    const badLimitRes = await fetch(`${baseUrl}/saved?limit=100`, { headers: authHeadersA });
    assert.equal(badLimitRes.status, 422, 'Limit > 50 must be rejected with 422');

    // 10. Validation: page < 1 must be rejected
    const badPageRes = await fetch(`${baseUrl}/saved?page=0`, { headers: authHeadersA });
    assert.equal(badPageRes.status, 422, 'Page < 1 must be rejected with 422');

    // 11. Unsave Reel 1 via DELETE /:reelId/save
    const unsaveRes = await fetch(`${baseUrl}/${reel1.id}/save`, {
      method: 'DELETE',
      headers: authHeadersA,
    });
    assert.equal(unsaveRes.status, 200);

    // Verify Reel 1 is removed from User A's saved reels
    const afterUnsaveRes = await fetch(`${baseUrl}/saved`, { headers: authHeadersA });
    const afterUnsaveJson = await afterUnsaveRes.json();
    assert.equal(afterUnsaveJson.data.length, 1);
    assert.equal(afterUnsaveJson.data[0].id, reel2.id);
  } finally {
    if (reel1) {
      await prisma.savedReel.deleteMany({ where: { reelId: reel1.id } }).catch(() => {});
      await prisma.reel.deleteMany({ where: { id: reel1.id } }).catch(() => {});
    }
    if (reel2) {
      await prisma.savedReel.deleteMany({ where: { reelId: reel2.id } }).catch(() => {});
      await prisma.reel.deleteMany({ where: { id: reel2.id } }).catch(() => {});
    }
    if (archivedReel) {
      await prisma.savedReel.deleteMany({ where: { reelId: archivedReel.id } }).catch(() => {});
      await prisma.reel.deleteMany({ where: { id: archivedReel.id } }).catch(() => {});
    }
    if (userA) await prisma.user.deleteMany({ where: { id: userA.id } }).catch(() => {});
    if (userB) await prisma.user.deleteMany({ where: { id: userB.id } }).catch(() => {});
    server.close();
  }
});
