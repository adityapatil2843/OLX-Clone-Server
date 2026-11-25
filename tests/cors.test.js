import test from 'node:test';
import assert from 'node:assert/strict';
import app, { isOriginAllowed } from '../src/app.js';
import { envSchema } from '../src/config/env.js';

test('CORS — Production Domain & Preflight Options Verification', async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Allowed production domain receives correct CORS & credentials headers
    const prodRes = await fetch(`${baseUrl}/health`, {
      headers: {
        Origin: 'https://bazarr360.in',
      },
    });
    assert.equal(prodRes.status, 200);
    assert.equal(
      prodRes.headers.get('access-control-allow-origin'),
      'https://bazarr360.in',
      'Production domain must be allowed'
    );
    assert.equal(
      prodRes.headers.get('access-control-allow-credentials'),
      'true',
      'Credentials must be allowed for trusted production domain'
    );

    // 2. Preflight OPTIONS request responds with 204 and correct allowed methods/headers
    const preflightRes = await fetch(`${baseUrl}/api/v1/listings`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://bazarr360.in',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization',
      },
    });
    assert.equal(preflightRes.status, 204, 'OPTIONS preflight should return 204');
    assert.equal(
      preflightRes.headers.get('access-control-allow-origin'),
      'https://bazarr360.in'
    );
    assert.equal(
      preflightRes.headers.get('access-control-allow-credentials'),
      'true'
    );
    const allowMethods = preflightRes.headers.get('access-control-allow-methods') || '';
    assert.ok(allowMethods.includes('POST'), 'Must allow POST method');
    assert.ok(allowMethods.includes('GET'), 'Must allow GET method');
    assert.ok(allowMethods.includes('OPTIONS'), 'Must allow OPTIONS method');

    // 3. Unknown origin is rejected by CORS (no Access-Control-Allow-Origin header)
    const unknownRes = await fetch(`${baseUrl}/health`, {
      headers: {
        Origin: 'https://unauthorized-malicious-domain.com',
      },
    });
    assert.notEqual(
      unknownRes.headers.get('access-control-allow-origin'),
      'https://unauthorized-malicious-domain.com',
      'Unknown origin must not be reflected in access-control-allow-origin'
    );

    // 4. Request with no origin (e.g. mobile app, curl, server-to-server) is allowed
    const noOriginRes = await fetch(`${baseUrl}/health`);
    assert.equal(noOriginRes.status, 200, 'Requests with no origin header must be accepted');
  } finally {
    server.close();
  }
});

test('CORS — Origin Policy Unit Verification Across Environments', () => {
  // 1. Production environment rules
  assert.equal(
    isOriginAllowed('https://bazarr360.in', 'production'),
    true,
    'Production client must be allowed in production'
  );
  assert.equal(
    isOriginAllowed('https://www.bazarr360.in', 'production'),
    true,
    'Production www subdomain must be allowed in production'
  );
  assert.equal(
    isOriginAllowed('http://localhost:3000', 'production', new Set()),
    false,
    'Localhost must NOT be allowed in production without explicit configuration'
  );
  assert.equal(
    isOriginAllowed('http://127.0.0.1:8081', 'production', new Set()),
    false,
    'LAN/Private IP must NOT be allowed in production'
  );
  assert.equal(
    isOriginAllowed('https://evil-phishing.com', 'production'),
    false,
    'Arbitrary external domain must be blocked in production'
  );
  assert.equal(
    isOriginAllowed('*', 'production'),
    false,
    'Wildcard must never be allowed with credentials in production'
  );

  // 2. Local development environment rules (preserving dev origins)
  assert.equal(
    isOriginAllowed('http://localhost:3000', 'development'),
    true,
    'Localhost 3000 must be allowed in development'
  );
  assert.equal(
    isOriginAllowed('http://localhost:8081', 'development'),
    true,
    'Expo web / Metro port 8081 must be allowed in development'
  );
  assert.equal(
    isOriginAllowed('http://127.0.0.1:3000', 'development'),
    true,
    '127.0.0.1 must be allowed in development'
  );
  assert.equal(
    isOriginAllowed('http://192.168.1.50:8081', 'development'),
    true,
    'LAN IP must be allowed in development'
  );
  assert.equal(
    isOriginAllowed('https://bazarr360.in', 'development'),
    true,
    'Production domain is also safe to access in development'
  );
  assert.equal(
    isOriginAllowed('https://untrusted-attacker.com', 'development'),
    false,
    'Unknown external domain must still be blocked in development'
  );

  // 3. Requests without origin header
  assert.equal(
    isOriginAllowed(null, 'production'),
    true,
    'Missing origin (mobile/Postman) must be allowed in production'
  );
  assert.equal(
    isOriginAllowed(undefined, 'development'),
    true,
    'Missing origin (mobile/Postman) must be allowed in development'
  );
});

test('CORS — Schema Validation Safeguards', () => {
  // 1. Wildcard CORS origin is rejected in production
  const wildcardProd = envSchema.safeParse({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    CORS_ORIGIN: '*',
    JWT_ACCESS_SECRET: 'a-very-strong-production-access-secret-key-32chars',
    JWT_REFRESH_SECRET: 'a-very-strong-production-refresh-secret-key-32chars',
  });
  assert.equal(wildcardProd.success, false, 'Production schema must reject wildcard CORS');

  // 2. Wildcard within comma-separated list is rejected in production
  const wildcardListProd = envSchema.safeParse({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    CORS_ORIGIN: 'https://bazarr360.in, *',
    JWT_ACCESS_SECRET: 'a-very-strong-production-access-secret-key-32chars',
    JWT_REFRESH_SECRET: 'a-very-strong-production-refresh-secret-key-32chars',
  });
  assert.equal(wildcardListProd.success, false, 'Production schema must reject wildcard in list');

  // 3. Valid production configuration with https://bazarr360.in passes
  const validProd = envSchema.safeParse({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    CORS_ORIGIN: 'https://bazarr360.in',
    JWT_ACCESS_SECRET: 'a-very-strong-production-access-secret-key-32chars',
    JWT_REFRESH_SECRET: 'a-very-strong-production-refresh-secret-key-32chars',
  });
  assert.equal(validProd.success, true, 'Valid production config must pass');
});
