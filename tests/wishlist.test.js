import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { env } from '../src/config/env.js';

const tokenFor = (user) => jwt.sign({ sub: user.id, role: 'USER', email: user.email }, env.JWT_ACCESS_SECRET, { expiresIn: '1h' });

test('Wishlist — buyer can save, list, and remove an active listing', async () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/wishlist`;
  let owner;
  let buyer;
  let category;
  let listing;

  try {
    [owner, buyer] = await Promise.all([
      prisma.user.create({ data: { name: 'Owner', email: `wishlist-owner-${suffix}@example.com`, passwordHash: 'test-hash' } }),
      prisma.user.create({ data: { name: 'Buyer', email: `wishlist-buyer-${suffix}@example.com`, passwordHash: 'test-hash' } }),
    ]);
    category = await prisma.category.create({ data: { name: `Wishlist category ${suffix}`, slug: `wishlist-category-${suffix}` } });
    listing = await prisma.listing.create({ data: { ownerId: owner.id, categoryId: category.id, title: 'MacBook Air', price: 80000, contactPhone: '+919876543210' } });
    const headers = { Authorization: `Bearer ${tokenFor(buyer)}` };

    const add = await fetch(`${baseUrl}/${listing.id}`, { method: 'POST', headers });
    assert.equal(add.status, 201);

    const duplicate = await fetch(`${baseUrl}/${listing.id}`, { method: 'POST', headers });
    assert.equal(duplicate.status, 409);

    const saved = await fetch(baseUrl, { headers });
    assert.equal(saved.status, 200);
    assert.ok((await saved.json()).data.some((item) => item.id === listing.id));

    const remove = await fetch(`${baseUrl}/${listing.id}`, { method: 'DELETE', headers });
    assert.equal(remove.status, 200);
  } finally {
    if (listing) await prisma.wishlist.deleteMany({ where: { listingId: listing.id } });
    if (listing) await prisma.listing.deleteMany({ where: { id: listing.id } });
    if (owner) await prisma.user.deleteMany({ where: { id: owner.id } });
    if (buyer) await prisma.user.deleteMany({ where: { id: buyer.id } });
    if (category) await prisma.category.deleteMany({ where: { id: category.id } });
    server.close();
  }
});
