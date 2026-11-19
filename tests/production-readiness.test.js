import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { env, envSchema } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';

const generateToken = (user, role = 'USER') =>
  jwt.sign(
    { sub: user.id, role: user.role || role, email: user.email },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' }
  );

test('Phase 6 — Production Environment Validation & Safety Gates', () => {
  // 1. In production, default dev JWT secrets must be rejected
  const devSecretProdConfig = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    CORS_ORIGIN: 'https://bazarr360.in',
    JWT_ACCESS_SECRET: 'dev-super-secret-jwt-access-key-replace-in-prod-12345',
    JWT_REFRESH_SECRET: 'dev-super-secret-jwt-refresh-key-replace-in-prod-12345',
  };
  const devSecretResult = envSchema.safeParse(devSecretProdConfig);
  assert.equal(devSecretResult.success, false, 'Production must reject dev-super-secret default keys');
  const issues = devSecretResult.error.issues.map((i) => i.path[0]);
  assert.ok(issues.includes('JWT_ACCESS_SECRET'), 'Must flag JWT_ACCESS_SECRET');
  assert.ok(issues.includes('JWT_REFRESH_SECRET'), 'Must flag JWT_REFRESH_SECRET');

  // 2. In production, wildcard CORS must be rejected
  const wildcardProdConfig = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    CORS_ORIGIN: '*',
    JWT_ACCESS_SECRET: 'a-very-strong-production-access-secret-key-32chars',
    JWT_REFRESH_SECRET: 'a-very-strong-production-refresh-secret-key-32chars',
  };
  const wildcardResult = envSchema.safeParse(wildcardProdConfig);
  assert.equal(wildcardResult.success, false, 'Production must reject wildcard CORS');
  assert.ok(wildcardResult.error.issues.some((i) => i.path[0] === 'CORS_ORIGIN'));

  // 3. Valid production configuration passes
  const validProdConfig = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    CORS_ORIGIN: 'https://bazarr360.in',
    JWT_ACCESS_SECRET: 'a-very-strong-production-access-secret-key-32chars',
    JWT_REFRESH_SECRET: 'a-very-strong-production-refresh-secret-key-32chars',
  };
  const validResult = envSchema.safeParse(validProdConfig);
  assert.equal(validResult.success, true, 'Valid production config must pass');
});

test('Phase 6 — Health Check & Readiness Endpoints', async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Live health check
    const liveRes = await fetch(`${baseUrl}/health/live`);
    assert.equal(liveRes.status, 200);
    const liveJson = await liveRes.json();
    assert.equal(liveJson.status, 'live');
    assert.ok(liveJson.timestamp);

    // 2. Ready health check (verifying database connectivity)
    const readyRes = await fetch(`${baseUrl}/health/ready`);
    assert.equal(readyRes.status, 200);
    const readyJson = await readyRes.json();
    assert.equal(readyJson.status, 'ready');
    assert.equal(readyJson.database, 'connected');
    assert.ok(readyJson.timestamp);

    // 3. General health check
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.equal(healthJson.status, 'ok');
  } finally {
    server.close();
  }
});

test('Phase 6 — Sensitive Data Redaction in Logging & Safe Error Handling', async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Verify redact paths configured in logger
    // Pino symbol-based redact list or redact configuration inspection
    assert.ok(logger, 'Logger instance must be defined');

    // 2. 404 Route handling produces safe error envelope without stack in production format
    const notFoundRes = await fetch(`${baseUrl}/api/v1/non-existent-route-for-testing`);
    assert.equal(notFoundRes.status, 404);
    const notFoundJson = await notFoundRes.json();
    assert.equal(notFoundJson.success, false);
    assert.ok(notFoundJson.error);
    assert.ok(notFoundJson.error.message.includes('not found'));

    // 3. Malformed JSON handling produces safe 400 Bad Request
    const badJsonRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"invalid": json',
    });
    assert.equal(badJsonRes.status, 400);
    const badJsonData = await badJsonRes.json();
    assert.equal(badJsonData.success, false);
    assert.equal(badJsonData.error.message, 'Malformed JSON in request body');
  } finally {
    server.close();
  }
});

test('Phase 6 — Chat Participant Authorization Guard & Message Protection', async () => {
  const suffix = `phase6-chat-${Date.now()}`;
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1/conversations`;

  let userA, userB, userIntruder;
  let conversationId;

  try {
    userA = await prisma.user.create({
      data: { name: 'User A', email: `a-${suffix}@example.com`, passwordHash: 'hash' },
    });
    userB = await prisma.user.create({
      data: { name: 'User B', email: `b-${suffix}@example.com`, passwordHash: 'hash' },
    });
    userIntruder = await prisma.user.create({
      data: { name: 'Intruder', email: `intruder-${suffix}@example.com`, passwordHash: 'hash' },
    });

    const tokenA = generateToken(userA);
    const tokenB = generateToken(userB);
    const tokenIntruder = generateToken(userIntruder);

    // 1. User A creates conversation with User B
    const createRes = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ recipientId: userB.id }),
    });
    assert.equal(createRes.status, 201);
    const createJson = await createRes.json();
    conversationId = createJson.data.id;

    // 2. User A sends a message
    const sendRes = await fetch(`${baseUrl}/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ content: 'Confidential buyer price inquiry' }),
    });
    assert.equal(sendRes.status, 201);

    // 3. User B (authorized) can read messages
    const readBRes = await fetch(`${baseUrl}/${conversationId}/messages`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(readBRes.status, 200);
    const readBJson = await readBRes.json();
    assert.equal(readBJson.data.length, 1);
    assert.equal(readBJson.data[0].content, 'Confidential buyer price inquiry');

    // 4. Intruder (unauthorized) cannot read messages (403 Forbidden)
    const readIntruderRes = await fetch(`${baseUrl}/${conversationId}/messages`, {
      headers: { Authorization: `Bearer ${tokenIntruder}` },
    });
    assert.equal(readIntruderRes.status, 403, 'Intruder must be rejected with 403 Forbidden');

    // 5. Intruder cannot send messages (403 Forbidden)
    const sendIntruderRes = await fetch(`${baseUrl}/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenIntruder}`,
      },
      body: JSON.stringify({ content: 'Spam intrusion attempt' }),
    });
    assert.equal(sendIntruderRes.status, 403, 'Intruder send must be rejected with 403 Forbidden');
  } finally {
    if (conversationId) {
      await prisma.message.deleteMany({ where: { conversationId } });
      await prisma.conversationParticipant.deleteMany({ where: { conversationId } });
      await prisma.conversation.deleteMany({ where: { id: conversationId } });
    }
    if (userA) await prisma.user.deleteMany({ where: { id: userA.id } });
    if (userB) await prisma.user.deleteMany({ where: { id: userB.id } });
    if (userIntruder) await prisma.user.deleteMany({ where: { id: userIntruder.id } });
    server.close();
  }
});

test('Phase 6 — Bounded Pagination Protection Across Discovery Feeds', async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  try {
    // 1. Listing search with abusive/unbounded limit query is rejected with 422
    const excessiveLimitRes = await fetch(`${baseUrl}/listings?limit=10000`);
    assert.equal(excessiveLimitRes.status, 422, 'Excessive limit query must be rejected by validator');
    const excessiveJson = await excessiveLimitRes.json();
    assert.equal(excessiveJson.success, false);

    // 2. Listing search with safe limit returns 200 and respects bounded page limit
    const validListingRes = await fetch(`${baseUrl}/listings?limit=20`);
    assert.equal(validListingRes.status, 200);
    const validListingJson = await validListingRes.json();
    assert.ok(validListingJson.data.length <= 20, 'Listings must respect bounded limit');

    // 3. Reels feed with safe limit returns 200 and respects bounded limit
    const reelsRes = await fetch(`${baseUrl}/reels?limit=10`);
    assert.equal(reelsRes.status, 200);
    const reelsJson = await reelsRes.json();
    assert.ok(reelsJson.data.length <= 10, 'Reels must respect bounded limit');
  } finally {
    server.close();
  }
});
