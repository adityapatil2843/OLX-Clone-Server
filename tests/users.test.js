import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { prisma } from '../src/db/prisma.js';

test('Users Module — Endpoints & Protection', async () => {
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/v1/users`;

  let testUserId = null;

  try {
    // 1. GET /api/v1/users (list public users)
    const listRes = await fetch(baseUrl);
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.equal(listJson.success, true);
    assert.ok(Array.isArray(listJson.data));

    // 2. GET /api/v1/users/:userId for non-existent user returns 404
    const notFoundRes = await fetch(`${baseUrl}/00000000-0000-0000-0000-000000000000`);
    assert.equal(notFoundRes.status, 404);
    const notFoundJson = await notFoundRes.json();
    assert.equal(notFoundJson.success, false);
    assert.match(notFoundJson.error.message, /not found/i);

    // 3. Create a test user via Prisma directly (safe seeding)
    const created = await prisma.user.create({
      data: {
        name: 'Test Seller',
        email: `seller-${Date.now()}@example.com`,
        phone: `+9198765${Math.floor(Math.random() * 90000 + 10000)}`,
        bio: 'Marketplace test seller bio',
        locationCity: 'Mumbai',
        locationState: 'Maharashtra',
      },
    });
    testUserId = created.id;

    // 4. GET /api/v1/users/:userId retrieves public profile
    const getRes = await fetch(`${baseUrl}/${testUserId}`);
    assert.equal(getRes.status, 200);
    const getJson = await getRes.json();
    assert.equal(getJson.success, true);
    assert.equal(getJson.data.name, 'Test Seller');
    assert.equal(getJson.data.phone, undefined, 'Phone must not be leaked in public profile');
    assert.equal(getJson.data.email, undefined, 'Email must not be leaked in public profile');

    // 5. PATCH /api/v1/users/:userId/profile rejects restricted fields like 'role'
    const forbidRes = await fetch(`${baseUrl}/${testUserId}/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'ADMIN' }),
    });
    assert.equal(forbidRes.status, 422, 'Strict validation must reject role field modification');

    // 6. PATCH /api/v1/users/:userId/profile allows allowed fields
    const updateRes = await fetch(`${baseUrl}/${testUserId}/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bio: 'Updated test seller bio' }),
    });
    assert.equal(updateRes.status, 200);
    const updateJson = await updateRes.json();
    assert.equal(updateJson.data.bio, 'Updated test seller bio');
  } finally {
    if (testUserId) {
      await prisma.user.deleteMany({ where: { id: testUserId } });
    }
    server.close();
  }
});
