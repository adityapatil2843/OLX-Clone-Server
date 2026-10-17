import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { prisma } from '../src/db/prisma.js';

test('Categories Module — Endpoints & Validation', async () => {
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/v1/categories`;

  let createdId = null;
  const testSlug = `electronics-test-${Date.now()}`;

  try {
    // 1. GET /api/v1/categories (list)
    const listRes = await fetch(baseUrl);
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.equal(listJson.success, true);
    assert.ok(Array.isArray(listJson.data));
    assert.ok(listJson.meta);

    // 2. Validation error on invalid payload (name too short)
    const invalidRes = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'A' }),
    });
    assert.equal(invalidRes.status, 422);
    const invalidJson = await invalidRes.json();
    assert.equal(invalidJson.success, false);
    assert.equal(invalidJson.error.message, 'Validation failed');

    // 3. POST /api/v1/categories (create valid category)
    const createRes = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Electronics Test',
        slug: testSlug,
        description: 'Test category description',
        displayOrder: 1,
      }),
    });
    assert.equal(createRes.status, 201);
    const createJson = await createRes.json();
    assert.equal(createJson.success, true);
    assert.equal(createJson.data.slug, testSlug);
    createdId = createJson.data.id;

    // 4. GET /api/v1/categories/:idOrSlug by slug
    const getSlugRes = await fetch(`${baseUrl}/${testSlug}`);
    assert.equal(getSlugRes.status, 200);
    const getSlugJson = await getSlugRes.json();
    assert.equal(getSlugJson.data.id, createdId);

    // 5. Duplicate slug rejection (409 Conflict)
    const dupRes = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Electronics Duplicate',
        slug: testSlug,
      }),
    });
    assert.equal(dupRes.status, 409);
    const dupJson = await dupRes.json();
    assert.equal(dupJson.success, false);
    assert.match(dupJson.error.message, /already exists/i);

    // 6. PATCH /api/v1/categories/:id
    const updateRes = await fetch(`${baseUrl}/${createdId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'Updated test description',
      }),
    });
    assert.equal(updateRes.status, 200);
    const updateJson = await updateRes.json();
    assert.equal(updateJson.data.description, 'Updated test description');

    // 7. GET /api/v1/categories?tree=true
    const treeRes = await fetch(`${baseUrl}?tree=true`);
    assert.equal(treeRes.status, 200);
    const treeJson = await treeRes.json();
    assert.equal(treeJson.success, true);
    assert.ok(Array.isArray(treeJson.data));

    // 8. DELETE /api/v1/categories/:id (deactivate)
    const deleteRes = await fetch(`${baseUrl}/${createdId}`, {
      method: 'DELETE',
    });
    assert.equal(deleteRes.status, 200);
  } finally {
    // Cleanup created category
    if (createdId) {
      await prisma.category.deleteMany({ where: { id: createdId } });
    }
    server.close();
  }
});
