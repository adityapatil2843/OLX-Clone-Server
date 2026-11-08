import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { env } from '../src/config/env.js';

const tokenFor = (user) =>
  jwt.sign({ sub: user.id, role: 'USER', email: user.email }, env.JWT_ACCESS_SECRET, {
    expiresIn: '1h',
  });

test('Chat — Empty conversation lifecycle, visibility, reuse, and message arrival', async () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/conversations`;

  let seller;
  let buyer;
  let category;
  let listing;
  let conversationId;

  try {
    [seller, buyer] = await Promise.all([
      prisma.user.create({
        data: {
          name: 'Chat Seller',
          email: `chat-seller-${suffix}@example.com`,
          passwordHash: 'test-hash',
        },
      }),
      prisma.user.create({
        data: {
          name: 'Chat Buyer',
          email: `chat-buyer-${suffix}@example.com`,
          passwordHash: 'test-hash',
        },
      }),
    ]);

    category = await prisma.category.create({
      data: {
        name: `Chat Category ${suffix}`,
        slug: `chat-cat-${suffix}`,
      },
    });

    listing = await prisma.listing.create({
      data: {
        ownerId: seller.id,
        categoryId: category.id,
        title: 'iPhone 15 Pro',
        price: 95000,
        contactPhone: '+919876543210',
      },
    });

    const buyerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenFor(buyer)}`,
    };
    const sellerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenFor(seller)}`,
    };

    // 1. Buyer taps Chat from listing -> conversation created/returned
    const createRes = await fetch(baseUrl, {
      method: 'POST',
      headers: buyerHeaders,
      body: JSON.stringify({
        recipientId: seller.id,
        listingId: listing.id,
      }),
    });
    assert.equal(createRes.status, 201);
    const createJson = await createRes.json();
    conversationId = createJson.data.id;
    assert.ok(conversationId);

    // 2. Buyer can enter and view the empty conversation directly
    const directRes = await fetch(`${baseUrl}/${conversationId}`, {
      headers: buyerHeaders,
    });
    assert.equal(directRes.status, 200);
    const directJson = await directRes.json();
    assert.equal(directJson.data.id, conversationId);

    // 3. Repeated Chat taps MUST reuse the same conversation
    const repeatRes = await fetch(baseUrl, {
      method: 'POST',
      headers: buyerHeaders,
      body: JSON.stringify({
        recipientId: seller.id,
        listingId: listing.id,
      }),
    });
    assert.equal(repeatRes.status, 201);
    const repeatJson = await repeatRes.json();
    assert.equal(repeatJson.data.id, conversationId, 'Repeated taps must reuse the existing conversation ID');

    // 4. Empty conversation MUST NOT appear in conversation list for either user
    const buyerListBefore = await fetch(baseUrl, { headers: buyerHeaders });
    assert.equal(buyerListBefore.status, 200);
    const buyerListBeforeJson = await buyerListBefore.json();
    assert.equal(
      buyerListBeforeJson.data.filter((c) => c.id === conversationId).length,
      0,
      'Buyer conversation list must not contain empty conversation'
    );

    const sellerListBefore = await fetch(baseUrl, { headers: sellerHeaders });
    assert.equal(sellerListBefore.status, 200);
    const sellerListBeforeJson = await sellerListBefore.json();
    assert.equal(
      sellerListBeforeJson.data.filter((c) => c.id === conversationId).length,
      0,
      'Seller conversation list must not contain empty conversation before any message is sent'
    );

    // 5. Buyer sends the first message
    const sendRes = await fetch(`${baseUrl}/${conversationId}/messages`, {
      method: 'POST',
      headers: buyerHeaders,
      body: JSON.stringify({
        content: 'Hi, is this iPhone 15 Pro still available?',
        type: 'TEXT',
      }),
    });
    assert.equal(sendRes.status, 201);

    // 6. After first message, conversation MUST appear in conversation list for both users
    const buyerListAfter = await fetch(baseUrl, { headers: buyerHeaders });
    assert.equal(buyerListAfter.status, 200);
    const buyerListAfterJson = await buyerListAfter.json();
    const buyerConv = buyerListAfterJson.data.find((c) => c.id === conversationId);
    assert.ok(buyerConv, 'Conversation must now appear in buyer list');
    const buyerParticipant = buyerConv.participants.find((p) => p.userId === buyer.id);
    assert.equal(buyerParticipant.unreadCount, 0, 'Sender unread count must be 0');

    const sellerListAfter = await fetch(baseUrl, { headers: sellerHeaders });
    assert.equal(sellerListAfter.status, 200);
    const sellerListAfterJson = await sellerListAfter.json();
    const sellerConv = sellerListAfterJson.data.find((c) => c.id === conversationId);
    assert.ok(sellerConv, 'Conversation must now appear in seller list');
    const sellerParticipant = sellerConv.participants.find((p) => p.userId === seller.id);
    assert.equal(sellerParticipant.unreadCount, 1, 'Receiver unread count must be incremented to 1');
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
    server.close();
  }
});

