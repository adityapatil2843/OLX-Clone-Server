import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { prisma } from '../src/db/prisma.js';

test('Auth Module — Registration, Login, Token Rotation, Logout & Me', async () => {
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/v1/auth`;

  const uniqueSuffix = Date.now();
  const testEmail = `auth-test-${uniqueSuffix}@example.com`;
  const testPassword = 'Password123!';
  const testName = 'Auth Test User';

  let registeredUserId = null;
  let accessToken = null;
  let refreshToken = null;

  try {
    // 1. POST /api/v1/auth/register (successful registration)
    const registerRes = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: testName,
        email: testEmail,
        password: testPassword,
        locationCity: 'Bengaluru',
        locationState: 'Karnataka',
      }),
    });

    assert.equal(registerRes.status, 201);
    const registerJson = await registerRes.json();
    assert.equal(registerJson.success, true);
    assert.equal(registerJson.data.user.email, testEmail);
    assert.equal(registerJson.data.user.passwordHash, undefined, 'passwordHash must never be leaked');
    assert.ok(registerJson.data.tokens.accessToken, 'Must return accessToken');
    assert.ok(registerJson.data.tokens.refreshToken, 'Must return refreshToken');
    registeredUserId = registerJson.data.user.id;

    // 2. POST /api/v1/auth/register with duplicate email returns 409
    const dupRes = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Duplicate User',
        email: testEmail,
        password: testPassword,
      }),
    });
    assert.equal(dupRes.status, 409);
    const dupJson = await dupRes.json();
    assert.equal(dupJson.success, false);
    assert.match(dupJson.error.message, /already exists/i);

    // 3. POST /api/v1/auth/login with wrong password returns 401
    const badLoginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'WrongPassword123!',
      }),
    });
    assert.equal(badLoginRes.status, 401);
    const badLoginJson = await badLoginRes.json();
    assert.equal(badLoginJson.success, false);

    // 4. POST /api/v1/auth/login with correct password returns 200 + tokens
    const loginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });
    assert.equal(loginRes.status, 200);
    const loginJson = await loginRes.json();
    assert.equal(loginJson.success, true);
    assert.ok(loginJson.data.tokens.accessToken);
    assert.ok(loginJson.data.tokens.refreshToken);
    accessToken = loginJson.data.tokens.accessToken;
    refreshToken = loginJson.data.tokens.refreshToken;

    // 5. GET /api/v1/auth/me with Bearer token returns 200
    const meRes = await fetch(`${baseUrl}/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(meRes.status, 200);
    const meJson = await meRes.json();
    assert.equal(meJson.success, true);
    assert.equal(meJson.data.id, registeredUserId);
    assert.equal(meJson.data.email, testEmail);

    // 6. GET /api/v1/auth/me without token (and when node_env is test) returns 401
    const noAuthMeRes = await fetch(`${baseUrl}/me`, {
      headers: {
        Authorization: 'Bearer invalid-token-string',
      },
    });
    assert.equal(noAuthMeRes.status, 401);

    // 7. POST /api/v1/auth/refresh with valid refreshToken rotates tokens
    const refreshRes = await fetch(`${baseUrl}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken,
      }),
    });
    assert.equal(refreshRes.status, 200);
    const refreshJson = await refreshRes.json();
    assert.equal(refreshJson.success, true);
    assert.ok(refreshJson.data.tokens.accessToken);
    assert.ok(refreshJson.data.tokens.refreshToken);
    assert.notEqual(refreshJson.data.tokens.refreshToken, refreshToken, 'Refresh token must rotate');

    const rotatedRefreshToken = refreshJson.data.tokens.refreshToken;

    // 8. Reusing old refresh token must be rejected (revoked by rotation)
    const reuseRes = await fetch(`${baseUrl}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken,
      }),
    });
    assert.equal(reuseRes.status, 401);

    // 9. POST /api/v1/auth/logout with rotated token revokes it
    const logoutRes = await fetch(`${baseUrl}/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: rotatedRefreshToken,
      }),
    });
    assert.equal(logoutRes.status, 200);
    const logoutJson = await logoutRes.json();
    assert.equal(logoutJson.success, true);

    // 10. Refreshing with logged out token fails with 401
    const postLogoutRefreshRes = await fetch(`${baseUrl}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: rotatedRefreshToken,
      }),
    });
    assert.equal(postLogoutRefreshRes.status, 401);

  } finally {
    if (registeredUserId) {
      await prisma.refreshToken.deleteMany({ where: { userId: registeredUserId } });
      await prisma.user.deleteMany({ where: { id: registeredUserId } });
    }
    server.close();
  }
});
