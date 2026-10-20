import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { env } from '../src/config/env.js';
import { getTestSentOtp } from '../src/utils/email.js';

const generateToken = (user, role = 'USER') =>
  jwt.sign(
    { sub: user.id, role: user.role || role, email: user.email },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' }
  );

test('Flow A — Authentication with Email OTP, Expiry & Profile Access', async () => {
  const suffix = `flow-a-${Date.now()}`;
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/auth`;
  const email = `test-${suffix}@example.com`;

  try {
    // 1. Request email OTP
    const reqOtpRes = await fetch(`${baseUrl}/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, purpose: 'REGISTRATION' }),
    });
    assert.equal(reqOtpRes.status, 200);
    const reqOtpJson = await reqOtpRes.json();
    assert.equal(reqOtpJson.success, true);

    // 2. Obtain sent OTP safely from test provider
    const otp = getTestSentOtp(email, 'REGISTRATION');
    assert.ok(otp, 'OTP must have been generated and dispatched');
    assert.equal(otp.length, 6);

    // 3. Reject invalid OTP
    const badVerifyRes = await fetch(`${baseUrl}/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp: '000000', purpose: 'REGISTRATION' }),
    });
    assert.equal(badVerifyRes.status, 400);

    // 4. Verify the correct OTP
    const verifyRes = await fetch(`${baseUrl}/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, purpose: 'REGISTRATION' }),
    });
    assert.equal(verifyRes.status, 200);
    const verifyJson = await verifyRes.json();
    assert.equal(verifyJson.success, true);
    assert.equal(verifyJson.data.verified, true);

    // 5. Complete registration
    const regRes = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Flow A User',
        email,
        password: 'Password@123',
        phone: '9876500001',
      }),
    });
    assert.equal(regRes.status, 201);
    const regJson = await regRes.json();
    assert.ok(regJson.data.tokens.accessToken);
    const accessToken = regJson.data.tokens.accessToken;

    // 6. Access authorized profile endpoint
    const meRes = await fetch(`${baseUrl}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.equal(meRes.status, 200);
    const meJson = await meRes.json();
    assert.equal(meJson.data.email, email);
    assert.equal(meJson.data.name, 'Flow A User');
  } finally {
    await prisma.emailOtp.deleteMany({ where: { email } });
    await prisma.user.deleteMany({ where: { email } });
    server.close();
  }
});

test('Flow B — Seller creates a Listing with Category Attributes & Ownership Guard', async () => {
  const suffix = `flow-b-${Date.now()}`;
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  let seller;
  let buyer;
  let category;
  let listingId;

  try {
    seller = await prisma.user.create({
      data: { name: 'Seller B', email: `seller-${suffix}@example.com`, passwordHash: 'hash' },
    });
    buyer = await prisma.user.create({
      data: { name: 'Buyer B', email: `buyer-${suffix}@example.com`, passwordHash: 'hash' },
    });

    // 1. Create category with attribute definitions
    category = await prisma.category.create({
      data: {
        name: `Cars ${suffix}`,
        slug: `cars-${suffix}`,
        attributes: [
          { key: 'brand', label: 'Brand', type: 'string', required: true, options: ['Honda', 'Hyundai', 'Tata'] },
          { key: 'year', label: 'Year', type: 'number', required: true, min: 2000, max: 2026 },
        ],
      },
    });

    const sellerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${generateToken(seller)}`,
    };
    const buyerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${generateToken(buyer)}`,
    };

    // 2. Fetch category attributes
    const attrRes = await fetch(`${baseUrl}/categories/${category.slug}/attributes`);
    assert.equal(attrRes.status, 200);
    const attrJson = await attrRes.json();
    assert.equal(attrJson.data.attributes.length, 2);

    // 3. Reject invalid attribute value (invalid brand option)
    const badListingRes = await fetch(`${baseUrl}/listings`, {
      method: 'POST',
      headers: sellerHeaders,
      body: JSON.stringify({
        title: 'Honda City 2022',
        price: 950000,
        categoryId: category.id,
        contactPhone: '+919876543210',
        attributes: { brand: 'Ferrari', year: 2022 },
      }),
    });
    assert.equal(badListingRes.status, 400);

    // 4. Create listing with valid attributes
    const createRes = await fetch(`${baseUrl}/listings`, {
      method: 'POST',
      headers: sellerHeaders,
      body: JSON.stringify({
        title: 'Honda City 2022',
        price: 950000,
        categoryId: category.id,
        contactPhone: '+919876543210',
        locationCity: 'Pune',
        locationState: 'Maharashtra',
        attributes: { brand: 'Honda', year: 2022 },
      }),
    });
    assert.equal(createRes.status, 201);
    const createJson = await createRes.json();
    listingId = createJson.data.id;
    assert.equal(createJson.data.attributes.brand, 'Honda');

    // 5. Associate media
    const mediaRes = await fetch(`${baseUrl}/listings/${listingId}/media`, {
      method: 'POST',
      headers: sellerHeaders,
      body: JSON.stringify({
        type: 'IMAGE',
        storageKey: `listings/${listingId}/front.jpg`,
        displayOrder: 0,
      }),
    });
    assert.equal(mediaRes.status, 201);

    // 6. Retrieve details
    const getRes = await fetch(`${baseUrl}/listings/${listingId}`);
    assert.equal(getRes.status, 200);
    const getJson = await getRes.json();
    assert.equal(getJson.data.media.length, 1);

    // 7. Reject unauthorized edits from non-owner
    const unauthEditRes = await fetch(`${baseUrl}/listings/${listingId}`, {
      method: 'PATCH',
      headers: buyerHeaders,
      body: JSON.stringify({ price: 500000 }),
    });
    assert.equal(unauthEditRes.status, 404); // Non-owner cannot access or edit
  } finally {
    if (listingId) await prisma.listing.deleteMany({ where: { id: listingId } });
    if (category) await prisma.category.deleteMany({ where: { id: category.id } });
    if (seller) await prisma.user.deleteMany({ where: { id: seller.id } });
    if (buyer) await prisma.user.deleteMany({ where: { id: buyer.id } });
    server.close();
  }
});

test('Flow C — Reel Discovery, Cursor Pagination, Like & Save, and Linked Listing', async () => {
  const suffix = `flow-c-${Date.now()}`;
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  let creator;
  let viewer;
  let category;
  let listing;
  let reelId;

  try {
    creator = await prisma.user.create({
      data: { name: 'Creator C', email: `creator-${suffix}@example.com`, passwordHash: 'hash' },
    });
    viewer = await prisma.user.create({
      data: { name: 'Viewer C', email: `viewer-${suffix}@example.com`, passwordHash: 'hash' },
    });
    category = await prisma.category.create({
      data: { name: `Mobiles ${suffix}`, slug: `mobiles-${suffix}` },
    });
    listing = await prisma.listing.create({
      data: {
        title: 'Pixel 8 Pro',
        price: 75000,
        categoryId: category.id,
        ownerId: creator.id,
        contactPhone: '+919999988888',
      },
    });

    const creatorHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${generateToken(creator)}`,
    };
    const viewerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${generateToken(viewer)}`,
    };

    // 1. Publish Reel with attached listing
    const reelRes = await fetch(`${baseUrl}/reels`, {
      method: 'POST',
      headers: creatorHeaders,
      body: JSON.stringify({
        caption: 'Reviewing Pixel 8 Pro in depth #tech #pixel',
        hashtags: ['tech', 'pixel'],
        listingId: listing.id,
        categoryId: category.id,
        videoStorageKey: 'reels/pixel-review.mp4',
        thumbnailStorageKey: 'reels/pixel-thumb.jpg',
      }),
    });
    assert.equal(reelRes.status, 201);
    const reelJson = await reelRes.json();
    reelId = reelJson.data.id;

    // Advance status to PUBLISHED
    await prisma.reel.update({
      where: { id: reelId },
      data: { status: 'PUBLISHED' },
    });

    // 2. Discover Reel in public feed
    const feedRes = await fetch(`${baseUrl}/reels?limit=5`);
    assert.equal(feedRes.status, 200);
    const feedJson = await feedRes.json();
    assert.ok(feedJson.data.some((r) => r.id === reelId));
    const feedReel = feedJson.data.find((r) => r.id === reelId);
    assert.equal(feedReel.listing.title, 'Pixel 8 Pro');

    // 3. Cursor pagination test
    const cursorFeedRes = await fetch(`${baseUrl}/reels?limit=1&cursor=${reelId}`);
    assert.equal(cursorFeedRes.status, 200);
    const cursorFeedJson = await cursorFeedRes.json();
    assert.ok(cursorFeedJson.meta);
    assert.equal(cursorFeedJson.meta.cursor, reelId);

    // 4. Like Reel
    const likeRes = await fetch(`${baseUrl}/reels/${reelId}/like`, {
      method: 'POST',
      headers: viewerHeaders,
    });
    assert.equal(likeRes.status, 200);

    // 5. Save Reel
    const saveRes = await fetch(`${baseUrl}/reels/${reelId}/save`, {
      method: 'POST',
      headers: viewerHeaders,
    });
    assert.equal(saveRes.status, 200);

    // 6. Comment on Reel
    const commentRes = await fetch(`${baseUrl}/reels/${reelId}/comments`, {
      method: 'POST',
      headers: viewerHeaders,
      body: JSON.stringify({ text: 'Awesome video! Is the phone still available?' }),
    });
    assert.equal(commentRes.status, 201);

    // 7. Inspect reel details with viewer tokens to verify isLiked & isSaved
    const detailRes = await fetch(`${baseUrl}/reels/${reelId}`, {
      headers: viewerHeaders,
    });
    assert.equal(detailRes.status, 200);
    const detailJson = await detailRes.json();
    assert.equal(detailJson.data.isLiked, true);
    assert.equal(detailJson.data.isSaved, true);
    assert.equal(detailJson.data.likesCount, 1);
    assert.equal(detailJson.data.commentsCount, 1);
    assert.equal(detailJson.data.listing.id, listing.id);

    // 8. Open linked listing
    const listingRes = await fetch(`${baseUrl}/listings/${detailJson.data.listing.id}`);
    assert.equal(listingRes.status, 200);
    const listingJson = await listingRes.json();
    assert.equal(listingJson.data.title, 'Pixel 8 Pro');
  } finally {
    if (reelId) {
      await prisma.reelLike.deleteMany({ where: { reelId } });
      await prisma.savedReel.deleteMany({ where: { reelId } });
      await prisma.reelComment.deleteMany({ where: { reelId } });
      await prisma.reel.deleteMany({ where: { id: reelId } });
    }
    if (listing) await prisma.listing.deleteMany({ where: { id: listing.id } });
    if (category) await prisma.category.deleteMany({ where: { id: category.id } });
    if (creator) await prisma.user.deleteMany({ where: { id: creator.id } });
    if (viewer) await prisma.user.deleteMany({ where: { id: viewer.id } });
    server.close();
  }
});

test('Flow D — Geospatial Discovery, Haversine Distance, and Radius Exclusion', async () => {
  const suffix = `flow-d-${Date.now()}`;
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/listings`;
  let seller;
  let category;
  let nearListing;
  let farListing;

  try {
    seller = await prisma.user.create({
      data: { name: 'Seller D', email: `seller-${suffix}@example.com`, passwordHash: 'hash' },
    });
    category = await prisma.category.create({
      data: { name: `Geo Cat ${suffix}`, slug: `geo-cat-${suffix}` },
    });

    // Reference point: Mumbai CST (18.9401, 72.8347)
    // Near listing: Bandra Mumbai (~15 km away: 19.0596, 72.8295)
    nearListing = await prisma.listing.create({
      data: {
        title: 'Near Item (Bandra)',
        price: 2000,
        categoryId: category.id,
        ownerId: seller.id,
        contactPhone: '+919999900000',
        latitude: 19.0596,
        longitude: 72.8295,
        locationCity: 'Mumbai',
        locationState: 'Maharashtra',
      },
    });

    // Far listing: Pune (~120 km away: 18.5204, 73.8567)
    farListing = await prisma.listing.create({
      data: {
        title: 'Far Item (Pune)',
        price: 3000,
        categoryId: category.id,
        ownerId: seller.id,
        contactPhone: '+919999900000',
        latitude: 18.5204,
        longitude: 73.8567,
        locationCity: 'Pune',
        locationState: 'Maharashtra',
      },
    });

    // 1. Search with 30 km radius from CST
    const searchRes = await fetch(
      `${baseUrl}?latitude=18.9401&longitude=72.8347&radius=30&categoryId=${category.id}`
    );
    assert.equal(searchRes.status, 200);
    const searchJson = await searchRes.json();

    // Verify near listing is present
    const ids = searchJson.data.map((l) => l.id);
    assert.ok(ids.includes(nearListing.id), 'Bandra listing must be included within 30km');
    // Verify far listing is EXCLUDED
    assert.ok(!ids.includes(farListing.id), 'Pune listing must be excluded beyond 30km');

    // 2. Reject mismatched coordinates (only latitude provided)
    const badCoordRes = await fetch(`${baseUrl}?latitude=18.9401`);
    assert.equal(badCoordRes.status, 422);

    // 3. Reject invalid latitude (out of bounds)
    const outOfBoundsRes = await fetch(`${baseUrl}?latitude=95&longitude=72.8347`);
    assert.equal(outOfBoundsRes.status, 422);
  } finally {
    if (nearListing) await prisma.listing.deleteMany({ where: { id: nearListing.id } });
    if (farListing) await prisma.listing.deleteMany({ where: { id: farListing.id } });
    if (category) await prisma.category.deleteMany({ where: { id: category.id } });
    if (seller) await prisma.user.deleteMany({ where: { id: seller.id } });
    server.close();
  }
});

test('Flow E — Sold Listing Automatically Stops Dependent Advertising Campaigns', async () => {
  const suffix = `flow-e-${Date.now()}`;
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  let seller;
  let category;
  let listing;
  let campaign;

  try {
    seller = await prisma.user.create({
      data: { name: 'Seller E', email: `seller-${suffix}@example.com`, passwordHash: 'hash' },
    });
    category = await prisma.category.create({
      data: { name: `Ad Cat ${suffix}`, slug: `ad-cat-${suffix}` },
    });
    listing = await prisma.listing.create({
      data: {
        title: 'Toyota Fortuner',
        price: 3200000,
        categoryId: category.id,
        ownerId: seller.id,
        contactPhone: '+919876543210',
      },
    });

    const sellerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${generateToken(seller)}`,
    };

    // 1. Create an active advertising campaign for this listing
    const adRes = await fetch(`${baseUrl}/advertisements`, {
      method: 'POST',
      headers: sellerHeaders,
      body: JSON.stringify({
        title: 'Featured Promotion for Fortuner',
        targetType: 'LISTING',
        targetId: listing.id,
        budget: 5000,
      }),
    });
    assert.equal(adRes.status, 201);
    const adJson = await adRes.json();
    campaign = adJson.data;
    assert.equal(campaign.status, 'ACTIVE');

    // 2. Mark the listing as SOLD
    const soldRes = await fetch(`${baseUrl}/listings/${listing.id}/status`, {
      method: 'PATCH',
      headers: sellerHeaders,
      body: JSON.stringify({ status: 'SOLD' }),
    });
    assert.equal(soldRes.status, 200);
    const soldJson = await soldRes.json();
    assert.equal(soldJson.data.status, 'SOLD');

    // 3. Verify dependent campaign is automatically STOPPED
    const getAdRes = await fetch(`${baseUrl}/advertisements/${campaign.id}`, {
      headers: sellerHeaders,
    });
    assert.equal(getAdRes.status, 200);
    const getAdJson = await getAdRes.json();
    assert.equal(getAdJson.data.status, 'STOPPED');
    assert.ok(getAdJson.data.stoppedAt);

    // 4. Verify stop operation is idempotent (calling stop again returns 200 without error)
    const repeatStopRes = await fetch(`${baseUrl}/advertisements/${campaign.id}/stop`, {
      method: 'POST',
      headers: sellerHeaders,
    });
    assert.equal(repeatStopRes.status, 200);

    // 5. Verify sold listing is no longer presented in public active listings
    const publicListRes = await fetch(`${baseUrl}/listings?categoryId=${category.id}`);
    assert.equal(publicListRes.status, 200);
    const publicListJson = await publicListRes.json();
    assert.ok(!publicListJson.data.some((l) => l.id === listing.id));
  } finally {
    if (campaign) await prisma.advertisement.deleteMany({ where: { id: campaign.id } });
    if (listing) await prisma.listing.deleteMany({ where: { id: listing.id } });
    if (category) await prisma.category.deleteMany({ where: { id: category.id } });
    if (seller) await prisma.user.deleteMany({ where: { id: seller.id } });
    server.close();
  }
});

test('Flow F — Buyer-Seller Chat and Participant Authorization Guard', async () => {
  const suffix = `flow-f-${Date.now()}`;
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/conversations`;
  let seller;
  let buyer;
  let intruder;
  let category;
  let listing;
  let conversationId;

  try {
    seller = await prisma.user.create({
      data: { name: 'Seller F', email: `seller-${suffix}@example.com`, passwordHash: 'hash' },
    });
    buyer = await prisma.user.create({
      data: { name: 'Buyer F', email: `buyer-${suffix}@example.com`, passwordHash: 'hash' },
    });
    intruder = await prisma.user.create({
      data: { name: 'Intruder F', email: `intruder-${suffix}@example.com`, passwordHash: 'hash' },
    });
    category = await prisma.category.create({
      data: { name: `Chat Cat ${suffix}`, slug: `chat-cat-${suffix}` },
    });
    listing = await prisma.listing.create({
      data: {
        title: 'Yamaha R15',
        price: 180000,
        categoryId: category.id,
        ownerId: seller.id,
        contactPhone: '+919876543210',
      },
    });

    const buyerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${generateToken(buyer)}`,
    };
    const sellerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${generateToken(seller)}`,
    };
    const intruderHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${generateToken(intruder)}`,
    };

    // 1. Buyer creates / retrieves conversation with seller for this listing
    const convRes = await fetch(baseUrl, {
      method: 'POST',
      headers: buyerHeaders,
      body: JSON.stringify({
        recipientId: seller.id,
        listingId: listing.id,
      }),
    });
    assert.equal(convRes.status, 201);
    const convJson = await convRes.json();
    conversationId = convJson.data.id;

    // 2. Buyer sends a message
    const msgRes = await fetch(`${baseUrl}/${conversationId}/messages`, {
      method: 'POST',
      headers: buyerHeaders,
      body: JSON.stringify({
        content: 'Hi! Is the Yamaha R15 still available? Can we negotiate on the price?',
      }),
    });
    assert.equal(msgRes.status, 201);
    const msgJson = await msgRes.json();
    assert.equal(msgJson.data.content, 'Hi! Is the Yamaha R15 still available? Can we negotiate on the price?');

    // 3. Seller retrieves conversation history
    const historyRes = await fetch(`${baseUrl}/${conversationId}/messages`, {
      headers: sellerHeaders,
    });
    assert.equal(historyRes.status, 200);
    const historyJson = await historyRes.json();
    assert.equal(historyJson.data.length, 1);
    assert.equal(historyJson.data[0].content, msgJson.data.content);

    // 4. Intruder is rejected from reading conversation history
    const intruderReadRes = await fetch(`${baseUrl}/${conversationId}/messages`, {
      headers: intruderHeaders,
    });
    assert.equal(intruderReadRes.status, 403, 'Intruder must be rejected with 403 Forbidden');

    // 5. Intruder is rejected from sending messages in conversation
    const intruderSendRes = await fetch(`${baseUrl}/${conversationId}/messages`, {
      method: 'POST',
      headers: intruderHeaders,
      body: JSON.stringify({ content: 'I am spying on you' }),
    });
    assert.equal(intruderSendRes.status, 403, 'Intruder must be rejected with 403 Forbidden');
  } finally {
    if (conversationId) {
      await prisma.message.deleteMany({ where: { conversationId } });
      await prisma.conversationParticipant.deleteMany({ where: { conversationId } });
      await prisma.conversation.deleteMany({ where: { id: conversationId } });
    }
    if (listing) await prisma.listing.deleteMany({ where: { id: listing.id } });
    if (category) await prisma.category.deleteMany({ where: { id: category.id } });
    if (seller) await prisma.user.deleteMany({ where: { id: seller.id } });
    if (buyer) await prisma.user.deleteMany({ where: { id: buyer.id } });
    if (intruder) await prisma.user.deleteMany({ where: { id: intruder.id } });
    server.close();
  }
});

test('Flow G — Admin Platform Metrics, Moderation, and Action Auditing', async () => {
  const suffix = `flow-g-${Date.now()}`;
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/admin`;
  let admin;
  let ordinaryUser;
  let category;
  let listing;

  try {
    admin = await prisma.user.create({
      data: {
        name: 'Admin User',
        email: `admin-${suffix}@example.com`,
        passwordHash: 'hash',
        role: 'ADMIN',
      },
    });
    ordinaryUser = await prisma.user.create({
      data: {
        name: 'Ordinary User',
        email: `ordinary-${suffix}@example.com`,
        passwordHash: 'hash',
        role: 'USER',
      },
    });
    category = await prisma.category.create({
      data: { name: `Admin Cat ${suffix}`, slug: `admin-cat-${suffix}` },
    });
    listing = await prisma.listing.create({
      data: {
        title: 'Spam Listing to Moderate',
        price: 100,
        categoryId: category.id,
        ownerId: ordinaryUser.id,
        contactPhone: '+919876543210',
        status: 'ACTIVE',
      },
    });

    const adminHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${generateToken(admin, 'ADMIN')}`,
    };
    const userHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${generateToken(ordinaryUser, 'USER')}`,
    };

    // 1. Request metrics with authorized admin
    const metricsRes = await fetch(`${baseUrl}/metrics`, { headers: adminHeaders });
    assert.equal(metricsRes.status, 200);
    const metricsJson = await metricsRes.json();
    assert.ok(metricsJson.data.users.active >= 1);
    assert.ok(metricsJson.data.listings.active >= 1);

    // 2. Ordinary user is rejected from accessing metrics with 403 Forbidden
    const unauthMetricsRes = await fetch(`${baseUrl}/metrics`, { headers: userHeaders });
    assert.equal(unauthMetricsRes.status, 403);

    // 3. Admin moderates the listing (suspends it)
    const moderateRes = await fetch(`${baseUrl}/listings/${listing.id}/moderate`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        status: 'ARCHIVED',
        reason: 'Violated terms of service',
      }),
    });
    assert.equal(moderateRes.status, 200);
    const moderateJson = await moderateRes.json();
    assert.equal(moderateJson.data.status, 'ARCHIVED');

    // 4. Verify audit log entry was created
    const auditRes = await fetch(`${baseUrl}/audit-logs`, { headers: adminHeaders });
    assert.equal(auditRes.status, 200);
    const auditJson = await auditRes.json();
    assert.ok(auditJson.data.some((log) => log.targetId === listing.id && log.action === 'MODERATE_LISTING'));
  } finally {
    if (listing) {
      await prisma.adminAuditLog.deleteMany({ where: { targetId: listing.id } });
      await prisma.listing.deleteMany({ where: { id: listing.id } });
    }
    if (category) await prisma.category.deleteMany({ where: { id: category.id } });
    if (admin) await prisma.user.deleteMany({ where: { id: admin.id } });
    if (ordinaryUser) await prisma.user.deleteMany({ where: { id: ordinaryUser.id } });
    server.close();
  }
});
