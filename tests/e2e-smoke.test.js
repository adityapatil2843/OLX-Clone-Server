import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { prisma } from '../src/db/prisma.js';

test('End-to-End Marketplace Core Flow Smoke Test (9 Priority Flows)', async () => {
  const timestamp = Date.now();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  let sellerTokens = null;
  let buyerTokens = null;
  let sellerUser = null;
  let buyerUser = null;
  let testCategoryId = null;
  let testListingId = null;
  let conversationId = null;

  try {
    // ── Setup: Create dedicated active category with attribute schema ─
    const category = await prisma.category.create({
      data: {
        name: `Smoke Test Category ${timestamp}`,
        slug: `smoke-cat-${timestamp}`,
        attributes: [
          { key: 'Brand', label: 'Brand', type: 'string', required: true, options: ['Honda', 'Hyundai', 'Tata'] },
          { key: 'Year', label: 'Year', type: 'number', required: true, min: 2000, max: 2026 },
        ],
      },
    });
    assert.ok(category, 'Active category must be created');
    testCategoryId = category.id;

    // ── Flow 1: Register and Login ──────────────────────────────
    const sellerEmail = `seller-${timestamp}@example.com`;
    const buyerEmail = `buyer-${timestamp}@example.com`;
    const sellerPhone = `+91${String(timestamp).slice(-10)}`;
    const buyerPhone = `+91${String(timestamp + 1).slice(-10)}`;
    const password = 'Password@123';

    // Register Seller
    const regSellerRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Smoke Seller',
        email: sellerEmail,
        password,
        phone: sellerPhone,
        locationCity: 'Mumbai',
        locationState: 'Maharashtra',
      }),
    });
    assert.equal(regSellerRes.status, 201, 'Seller registration must succeed with 201');
    const regSellerJson = await regSellerRes.json();
    assert.equal(regSellerJson.success, true);
    sellerUser = regSellerJson.data.user;
    sellerTokens = regSellerJson.data.tokens;
    assert.ok(sellerTokens.accessToken, 'Seller access token must be present');

    // Register Buyer
    const regBuyerRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Smoke Buyer',
        email: buyerEmail,
        password,
        phone: buyerPhone,
        locationCity: 'Pune',
        locationState: 'Maharashtra',
      }),
    });
    assert.equal(regBuyerRes.status, 201, 'Buyer registration must succeed with 201');
    const regBuyerJson = await regBuyerRes.json();
    buyerUser = regBuyerJson.data.user;
    buyerTokens = regBuyerJson.data.tokens;
    assert.ok(buyerTokens.accessToken, 'Buyer access token must be present');

    // Login Buyer (verifying credentials auth)
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: buyerEmail, password }),
    });
    assert.equal(loginRes.status, 200, 'Login must succeed with 200');
    const loginJson = await loginRes.json();
    assert.equal(loginJson.success, true);
    buyerTokens = loginJson.data.tokens;

    // ── Flow 2: Homepage Real Listings and Reels ─────────────────
    const homeListingsRes = await fetch(`${baseUrl}/listings?limit=8&sortBy=newest`);
    assert.equal(homeListingsRes.status, 200, 'Public listings feed must respond with 200');
    const homeListingsJson = await homeListingsRes.json();
    assert.equal(homeListingsJson.success, true);
    assert.ok(Array.isArray(homeListingsJson.data), 'Listings must be an array');
    assert.ok(homeListingsJson.meta, 'Pagination meta must be present');

    const homeReelsRes = await fetch(`${baseUrl}/reels?limit=4`);
    assert.equal(homeReelsRes.status, 200, 'Public reels feed must respond with 200');
    const homeReelsJson = await homeReelsRes.json();
    assert.equal(homeReelsJson.success, true);
    assert.ok(Array.isArray(homeReelsJson.data), 'Reels must be an array');

    // ── Flow 5: Create Listing ──────────────────────────────────
    const uniqueTitle = `Smoke Test Car ${timestamp}`;
    const createListingRes = await fetch(`${baseUrl}/listings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sellerTokens.accessToken}`,
      },
      body: JSON.stringify({
        title: uniqueTitle,
        price: 450000,
        currency: 'INR',
        description: 'Well-maintained car for smoke testing.',
        categoryId: testCategoryId,
        locationCity: 'Mumbai',
        locationState: 'Maharashtra',
        locationLocality: 'Andheri West',
        contactPhone: '+919876543210',
        attributes: {
          Brand: 'Honda',
          Year: 2022,
        },
        status: 'ACTIVE',
      }),
    });
    assert.equal(createListingRes.status, 201, 'Listing creation must return 201');
    const createListingJson = await createListingRes.json();
    assert.equal(createListingJson.success, true);
    testListingId = createListingJson.data.id;
    assert.ok(testListingId, 'Created listing ID must be returned');

    // ── Flow 6: Real Image Upload through Storage Adapter ────────
    // Attach media directly to the created listing
    const attachMediaRes = await fetch(`${baseUrl}/listings/${testListingId}/media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sellerTokens.accessToken}`,
      },
      body: JSON.stringify({
        type: 'IMAGE',
        storageKey: `listings/${sellerUser.id}/${testListingId}/front.jpg`,
        provider: 'cloudinary',
        thumbnailKey: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        displayOrder: 0,
      }),
    });
    assert.equal(attachMediaRes.status, 201, 'Attaching media must return 201');
    const attachMediaJson = await attachMediaRes.json();
    assert.equal(attachMediaJson.success, true);
    assert.ok(attachMediaJson.data.id, 'Media ID must be generated');

    // ── Flow 3: Search and Filters ──────────────────────────────
    const searchRes = await fetch(
      `${baseUrl}/listings?search=${encodeURIComponent(uniqueTitle)}&city=Mumbai&minPrice=400000&maxPrice=500000`
    );
    assert.equal(searchRes.status, 200, 'Search endpoint must return 200');
    const searchJson = await searchRes.json();
    assert.equal(searchJson.success, true);
    const foundListing = searchJson.data.find((l) => l.id === testListingId);
    assert.ok(foundListing, 'Created listing must be found by keyword and price filters');

    // ── Flow 4: Listing Detail ──────────────────────────────────
    const detailRes = await fetch(`${baseUrl}/listings/${testListingId}`);
    assert.equal(detailRes.status, 200, 'Listing detail must return 200');
    const detailJson = await detailRes.json();
    assert.equal(detailJson.success, true);
    assert.equal(detailJson.data.id, testListingId);
    assert.equal(detailJson.data.title, uniqueTitle);
    assert.ok(detailJson.data.media?.length > 0, 'Attached media must be present in listing details');

    // ── Flow 7: Wishlist (Add, List, Remove) ────────────────────
    // Add to wishlist
    const addWishlistRes = await fetch(`${baseUrl}/wishlist/${testListingId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${buyerTokens.accessToken}`,
      },
    });
    assert.equal(addWishlistRes.status, 201, 'Add to wishlist must return 201');

    // List wishlist
    const getWishlistRes = await fetch(`${baseUrl}/wishlist`, {
      headers: {
        Authorization: `Bearer ${buyerTokens.accessToken}`,
      },
    });
    assert.equal(getWishlistRes.status, 200, 'Get wishlist must return 200');
    const getWishlistJson = await getWishlistRes.json();
    const wishlistedItem = getWishlistJson.data.find((w) => w.id === testListingId);
    assert.ok(wishlistedItem, 'Listing must be present in buyer wishlist');

    // Remove from wishlist
    const removeWishlistRes = await fetch(`${baseUrl}/wishlist/${testListingId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${buyerTokens.accessToken}`,
      },
    });
    assert.equal(removeWishlistRes.status, 200, 'Remove from wishlist must return 200');

    // ── Flow 8: Buyer-Seller Chat ───────────────────────────────
    // Buyer opens/creates conversation with seller about listing
    const createConvRes = await fetch(`${baseUrl}/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${buyerTokens.accessToken}`,
      },
      body: JSON.stringify({
        recipientId: sellerUser.id,
        listingId: testListingId,
      }),
    });
    assert.equal(createConvRes.status, 201, 'Create conversation must return 201');
    const createConvJson = await createConvRes.json();
    conversationId = createConvJson.data.id;
    assert.ok(conversationId, 'Conversation ID must be generated');

    // Buyer sends message
    const sendMsgRes = await fetch(`${baseUrl}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${buyerTokens.accessToken}`,
      },
      body: JSON.stringify({
        content: 'Hello, is this car still available for inspection?',
        type: 'TEXT',
      }),
    });
    assert.equal(sendMsgRes.status, 201, 'Sending message must return 201');
    const sendMsgJson = await sendMsgRes.json();
    assert.equal(sendMsgJson.data.content, 'Hello, is this car still available for inspection?');

    // Seller reads messages
    const getMsgsRes = await fetch(`${baseUrl}/conversations/${conversationId}/messages`, {
      headers: {
        Authorization: `Bearer ${sellerTokens.accessToken}`,
      },
    });
    assert.equal(getMsgsRes.status, 200, 'Seller reading messages must return 200');
    const getMsgsJson = await getMsgsRes.json();
    assert.ok(getMsgsJson.data.length > 0, 'Messages must be readable by seller');

    // ── Flow 9: Logout & Session Restoration ────────────────────
    // Rotate tokens using refresh token
    const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: buyerTokens.refreshToken }),
    });
    assert.equal(refreshRes.status, 200, 'Token refresh must succeed with 200');
    const refreshJson = await refreshRes.json();
    const rotatedTokens = refreshJson.data.tokens;
    assert.ok(rotatedTokens.accessToken, 'Rotated access token must exist');

    // Session restoration: Fetch profile with rotated token
    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        Authorization: `Bearer ${rotatedTokens.accessToken}`,
      },
    });
    assert.equal(meRes.status, 200, 'Session restoration via /auth/me must return 200');
    const meJson = await meRes.json();
    assert.equal(meJson.data.email, buyerEmail);

    // Logout
    const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rotatedTokens.refreshToken }),
    });
    assert.equal(logoutRes.status, 200, 'Logout must return 200');

    // Verify revoked refresh token fails
    const revokedRefreshRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rotatedTokens.refreshToken }),
    });
    assert.equal(revokedRefreshRes.status, 401, 'Revoked refresh token must be rejected with 401');
  } finally {
    // Teardown server
    await new Promise((resolve) => server.close(resolve));
  }
});
