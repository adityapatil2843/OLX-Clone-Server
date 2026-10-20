import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { env } from '../src/config/env.js';

const tokenFor = (user) => jwt.sign({ sub: user.id, role: 'USER', email: user.email }, env.JWT_ACCESS_SECRET, { expiresIn: '1h' });

test('Listings — seller CRUD, media, and public discovery', async () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/listings`;
  let owner;
  let category;
  let listingId;

  try {
    owner = await prisma.user.create({ data: { name: 'Listing owner', email: `owner-${suffix}@example.com`, passwordHash: 'test-hash' } });
    category = await prisma.category.create({ data: { name: `Test category ${suffix}`, slug: `test-category-${suffix}` } });
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenFor(owner)}` };

    const create = await fetch(baseUrl, {
      method: 'POST', headers,
      body: JSON.stringify({ title: 'iPhone 15', price: 65000, categoryId: category.id, description: 'Excellent condition', locationState: 'Maharashtra', locationCity: 'Mumbai', contactPhone: '+919876543210' }),
    });
    assert.equal(create.status, 201);
    const created = await create.json();
    listingId = created.data.id;
    assert.equal(created.data.title, 'iPhone 15');

    const feed = await fetch(`${baseUrl}?categoryId=${category.id}&city=Mumbai`);
    assert.equal(feed.status, 200);
    const feedJson = await feed.json();
    assert.ok(feedJson.data.some((listing) => listing.id === listingId));

    const mine = await fetch(`${baseUrl}/mine`, { headers });
    assert.equal(mine.status, 200);
    assert.ok((await mine.json()).data.some((listing) => listing.id === listingId));

    const update = await fetch(`${baseUrl}/${listingId}`, { method: 'PATCH', headers, body: JSON.stringify({ price: 63000, title: 'iPhone 15 - updated' }) });
    assert.equal(update.status, 200);
    assert.equal((await update.json()).data.price, '63000');

    const signature = await fetch(`${baseUrl}/${listingId}/media/upload-signature`, { method: 'POST', headers, body: JSON.stringify({ type: 'IMAGE', fileName: 'phone.jpg', fileType: 'image/jpeg', fileSizeBytes: 1000 }) });
    assert.equal(signature.status, 200);

    const media = await fetch(`${baseUrl}/${listingId}/media`, { method: 'POST', headers, body: JSON.stringify({ type: 'IMAGE', storageKey: `listings/${listingId}/phone`, displayOrder: 0 }) });
    assert.equal(media.status, 201);

    const detail = await fetch(`${baseUrl}/${listingId}`);
    assert.equal(detail.status, 200);
    const detailJson = await detail.json();
    assert.equal(detailJson.data.contactPhone, '+919876543210');
    assert.equal(detailJson.data.media.length, 1);

    const archive = await fetch(`${baseUrl}/${listingId}`, { method: 'DELETE', headers });
    assert.equal(archive.status, 200);
    const unavailable = await fetch(`${baseUrl}/${listingId}`);
    assert.equal(unavailable.status, 404);
  } finally {
    if (listingId) await prisma.listing.deleteMany({ where: { id: listingId } });
    if (owner) await prisma.user.deleteMany({ where: { id: owner.id } });
    if (category) await prisma.category.deleteMany({ where: { id: category.id } });
    server.close();
  }
});
