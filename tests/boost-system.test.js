import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { env } from '../src/config/env.js';
import { expireAdvertisements } from '../src/jobs/advertisements/expire-advertisements.job.js';

const generateToken = (user, role = 'USER') =>
  jwt.sign(
    { sub: user.id, role: user.role || role, email: user.email },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' }
  );

test('Boost & Wallet System — Registration Welcome Bonus & Ledger Verification', async () => {
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  const suffix = `wallet-reg-${Date.now()}`;
  let registeredUserId = null;

  try {
    // 1. Register a new user via API
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bonus User',
        email: `bonus-${suffix}@example.com`,
        password: 'Password123!',
      }),
    });
    assert.equal(regRes.status, 201);
    const regJson = await regRes.json();
    registeredUserId = regJson.data.user.id;
    const token = regJson.data.tokens.accessToken;

    // 2. Verify wallet balance is 200
    const balanceRes = await fetch(`${baseUrl}/wallet/balance`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(balanceRes.status, 200);
    const balanceJson = await balanceRes.json();
    assert.equal(balanceJson.data.coinsBalance, 200);

    // 3. Verify exactly one WELCOME_BONUS transaction in ledger
    const txRes = await fetch(`${baseUrl}/wallet/transactions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(txRes.status, 200);
    const txJson = await txRes.json();
    assert.equal(txJson.data.length, 1);
    assert.equal(txJson.data[0].type, 'WELCOME_BONUS');
    assert.equal(txJson.data[0].amount, 200);
    assert.equal(txJson.data[0].balanceAfter, 200);
  } finally {
    if (registeredUserId) {
      await prisma.coinTransaction.deleteMany({ where: { userId: registeredUserId } });
      await prisma.refreshToken.deleteMany({ where: { userId: registeredUserId } });
      await prisma.user.deleteMany({ where: { id: registeredUserId } });
    }
    server.close();
  }
});

test('Boost System — Validation & Negative Paths', async () => {
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  const suffix = `val-${Date.now()}`;
  let userA, userB, category, listingA;

  try {
    userA = await prisma.user.create({
      data: { name: 'User A', email: `usera-${suffix}@example.com`, passwordHash: 'hash', coinsBalance: 200 },
    });
    userB = await prisma.user.create({
      data: { name: 'User B', email: `userb-${suffix}@example.com`, passwordHash: 'hash', coinsBalance: 200 },
    });
    category = await prisma.category.create({
      data: { name: `Cat ${suffix}`, slug: `cat-${suffix}` },
    });
    listingA = await prisma.listing.create({
      data: { title: 'Bike', price: 50000, categoryId: category.id, ownerId: userA.id, contactPhone: '+919999900000', status: 'ACTIVE' },
    });

    const headersA = { 'Content-Type': 'application/json', Authorization: `Bearer ${generateToken(userA)}` };
    const headersB = { 'Content-Type': 'application/json', Authorization: `Bearer ${generateToken(userB)}` };

    const pkg = await prisma.boostPackage.findFirst({ where: { isActive: true, coinsCost: 50 } });
    assert.ok(pkg);

    // 1. Unauthenticated / invalid token rejected with 401
    const unauthRes = await fetch(`${baseUrl}/advertisements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid-token',
      },
      body: JSON.stringify({ targetType: 'LISTING', targetId: listingA.id, packageId: pkg.id }),
    });
    assert.equal(unauthRes.status, 401);

    // 2. Arbitrary budget rejected with 422
    const budgetRes = await fetch(`${baseUrl}/advertisements`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ targetType: 'LISTING', targetId: listingA.id, packageId: pkg.id, budget: 1000 }),
    });
    assert.equal(budgetRes.status, 422);

    // 3. Client-controlled status / dates rejected with 422
    const clientStatusRes = await fetch(`${baseUrl}/advertisements`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ targetType: 'LISTING', targetId: listingA.id, packageId: pkg.id, status: 'ACTIVE' }),
    });
    assert.equal(clientStatusRes.status, 422);

    // 4. Invalid package UUID rejected with 404
    const fakePkgRes = await fetch(`${baseUrl}/advertisements`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ targetType: 'LISTING', targetId: listingA.id, packageId: '00000000-0000-4000-8000-000000000000' }),
    });
    assert.equal(fakePkgRes.status, 404);

    // 5. Inactive package rejected with 400
    const inactivePkg = await prisma.boostPackage.create({
      data: { name: 'Inactive Pkg', durationDays: 1, coinsCost: 10, isActive: false, sortOrder: 99 },
    });
    const inactiveRes = await fetch(`${baseUrl}/advertisements`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ targetType: 'LISTING', targetId: listingA.id, packageId: inactivePkg.id }),
    });
    assert.equal(inactiveRes.status, 400);
    await prisma.boostPackage.delete({ where: { id: inactivePkg.id } });

    // 6. Non-owner cannot boost listing (403)
    const nonOwnerRes = await fetch(`${baseUrl}/advertisements`, {
      method: 'POST',
      headers: headersB,
      body: JSON.stringify({ targetType: 'LISTING', targetId: listingA.id, packageId: pkg.id }),
    });
    assert.equal(nonOwnerRes.status, 403);

    // 7. Insufficient balance fails with clear error message (400)
    await prisma.user.update({ where: { id: userA.id }, data: { coinsBalance: 10 } });
    const poorRes = await fetch(`${baseUrl}/advertisements`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ targetType: 'LISTING', targetId: listingA.id, packageId: pkg.id }),
    });
    assert.equal(poorRes.status, 400);
    const poorJson = await poorRes.json();
    const poorMsg = poorJson.error?.message || poorJson.message || '';
    assert.ok(poorMsg.includes('Insufficient coins for this boost package'));
  } finally {
    if (listingA) await prisma.listing.deleteMany({ where: { id: listingA.id } });
    if (category) await prisma.category.deleteMany({ where: { id: category.id } });
    if (userA) await prisma.user.deleteMany({ where: { id: userA.id } });
    if (userB) await prisma.user.deleteMany({ where: { id: userB.id } });
    server.close();
  }
});

test('Boost System — Atomic Boost, Idempotency, Duplicate Active Guard & Price Snapshot', async () => {
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  const suffix = `atomic-${Date.now()}`;
  let user, category, listing, adId;

  try {
    user = await prisma.user.create({
      data: { name: 'Boost Owner', email: `owner-${suffix}@example.com`, passwordHash: 'hash', coinsBalance: 200 },
    });
    category = await prisma.category.create({
      data: { name: `Cat ${suffix}`, slug: `cat-${suffix}` },
    });
    listing = await prisma.listing.create({
      data: { title: 'MacBook Air', price: 80000, categoryId: category.id, ownerId: user.id, contactPhone: '+919999911111', status: 'ACTIVE' },
    });

    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${generateToken(user)}` };
    const pkg = await prisma.boostPackage.findFirst({ where: { isActive: true, durationDays: 1 } });
    const idempotencyKey = `idem-key-${suffix}`;

    // 1. Create Boost successfully
    const boostRes = await fetch(`${baseUrl}/advertisements`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        targetType: 'LISTING',
        targetId: listing.id,
        packageId: pkg.id,
        idempotencyKey,
      }),
    });
    assert.equal(boostRes.status, 201);
    const boostJson = await boostRes.json();
    adId = boostJson.data.id;
    assert.equal(boostJson.data.status, 'ACTIVE');
    assert.equal(boostJson.data.coinsSpent, pkg.coinsCost);
    assert.equal(boostJson.data.packageDays, pkg.durationDays);

    // 2. Verify exact balance debit and ledger snapshot
    const userAfter = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(userAfter.coinsBalance, 200 - pkg.coinsCost);

    const tx = await prisma.coinTransaction.findFirst({ where: { referenceId: adId } });
    assert.ok(tx);
    assert.equal(tx.amount, -pkg.coinsCost);
    assert.equal(tx.balanceAfter, 200 - pkg.coinsCost);
    assert.equal(tx.type, 'BOOST_SPENT');

    // 3. Repeated request with same idempotencyKey does not double-charge or create duplicate
    const retryRes = await fetch(`${baseUrl}/advertisements`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        targetType: 'LISTING',
        targetId: listing.id,
        packageId: pkg.id,
        idempotencyKey,
      }),
    });
    assert.equal(retryRes.status, 201);
    const retryJson = await retryRes.json();
    assert.equal(retryJson.data.id, adId, 'Must return identical advertisement ID without double charging');

    const userRetry = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(userRetry.coinsBalance, 200 - pkg.coinsCost, 'Coins balance must remain unchanged');

    // 4. Duplicate ACTIVE boost without idempotencyKey rejected with 400
    const dupRes = await fetch(`${baseUrl}/advertisements`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        targetType: 'LISTING',
        targetId: listing.id,
        packageId: pkg.id,
      }),
    });
    assert.equal(dupRes.status, 400);
    const dupJson = await dupRes.json();
    const dupMsg = dupJson.error?.message || dupJson.message || '';
    assert.ok(dupMsg.includes('An active boost already exists for this target'));
  } finally {
    if (adId) {
      await prisma.coinTransaction.deleteMany({ where: { referenceId: adId } });
      await prisma.advertisement.deleteMany({ where: { id: adId } });
    }
    if (listing) await prisma.listing.deleteMany({ where: { id: listing.id } });
    if (category) await prisma.category.deleteMany({ where: { id: category.id } });
    if (user) await prisma.user.deleteMany({ where: { id: user.id } });
    server.close();
  }
});

test('Boost System — Expiry Handling & Feed Filtering', async () => {
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  const suffix = `exp-${Date.now()}`;
  let user, category, listingActive, listingExpired, adActive, adExpired;

  try {
    user = await prisma.user.create({
      data: { name: 'Feed User', email: `feed-${suffix}@example.com`, passwordHash: 'hash', coinsBalance: 500 },
    });
    category = await prisma.category.create({
      data: { name: `Feed Cat ${suffix}`, slug: `feed-cat-${suffix}` },
    });
    listingActive = await prisma.listing.create({
      data: { title: `Active Bike ${suffix}`, price: 40000, categoryId: category.id, ownerId: user.id, contactPhone: '+919999922222', status: 'ACTIVE' },
    });
    listingExpired = await prisma.listing.create({
      data: { title: `Expired Bike ${suffix}`, price: 30000, categoryId: category.id, ownerId: user.id, contactPhone: '+919999933333', status: 'ACTIVE' },
    });

    const pkg = await prisma.boostPackage.findFirst({ where: { isActive: true } });

    // Active boost with future endDate
    adActive = await prisma.advertisement.create({
      data: {
        ownerId: user.id,
        targetType: 'LISTING',
        targetId: listingActive.id,
        listingId: listingActive.id,
        packageId: pkg.id,
        packageDays: 1,
        coinsSpent: 50,
        title: 'Active Boost',
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Expired boost with past endDate
    adExpired = await prisma.advertisement.create({
      data: {
        ownerId: user.id,
        targetType: 'LISTING',
        targetId: listingExpired.id,
        listingId: listingExpired.id,
        packageId: pkg.id,
        packageDays: 1,
        coinsSpent: 50,
        title: 'Expired Boost',
        status: 'ACTIVE',
        startDate: new Date(Date.now() - 48 * 60 * 60 * 1000),
        endDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    // 1. Check public feed excludes expired boost even before job runs
    const feedRes = await fetch(`${baseUrl}/listings?categoryId=${category.id}`);
    assert.equal(feedRes.status, 200);
    const feedJson = await feedRes.json();
    const sponsoredItems = feedJson.data.filter((item) => item.isSponsored);
    const sponsoredIds = sponsoredItems.map((item) => item.id);

    assert.ok(sponsoredIds.includes(listingActive.id), 'Active boost must be presented as sponsored');
    assert.ok(!sponsoredIds.includes(listingExpired.id), 'Expired boost must never be presented as sponsored');

    // 2. Run idempotent expireAdvertisements job
    const jobResult = await expireAdvertisements();
    assert.ok(jobResult.expiredCount >= 1, 'Job must mark at least 1 ad COMPLETED');

    const expiredAdInDb = await prisma.advertisement.findUnique({ where: { id: adExpired.id } });
    assert.equal(expiredAdInDb.status, 'COMPLETED');

    // 3. Second run of job is idempotent (0 additional ads expired)
    const secondRun = await expireAdvertisements();
    assert.equal(secondRun.expiredCount, 0);
  } finally {
    if (adActive) await prisma.advertisement.deleteMany({ where: { id: adActive.id } });
    if (adExpired) await prisma.advertisement.deleteMany({ where: { id: adExpired.id } });
    if (listingActive) await prisma.listing.deleteMany({ where: { id: listingActive.id } });
    if (listingExpired) await prisma.listing.deleteMany({ where: { id: listingExpired.id } });
    if (category) await prisma.category.deleteMany({ where: { id: category.id } });
    if (user) await prisma.user.deleteMany({ where: { id: user.id } });
    server.close();
  }
});
