import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import {
  ApiError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../src/utils/errors.js';
import { successResponse, errorResponse } from '../src/utils/response.js';

test('Foundation — Environment Configuration', () => {
  assert.ok(env.NODE_ENV, 'NODE_ENV should be defined');
  assert.ok(env.PORT, 'PORT should be defined');
  assert.ok(env.DATABASE_URL, 'DATABASE_URL should be defined');
  assert.equal(typeof env.PORT, 'number', 'PORT should be coerced to number');
});

test('Foundation — Standard Error Hierarchy', () => {
  const badReq = new BadRequestError('Invalid input', { field: 'name' });
  assert.equal(badReq.statusCode, 400);
  assert.equal(badReq.isOperational, true);
  assert.deepEqual(badReq.details, { field: 'name' });

  const unauth = new UnauthorizedError();
  assert.equal(unauth.statusCode, 401);

  const forbidden = new ForbiddenError();
  assert.equal(forbidden.statusCode, 403);

  const notFound = new NotFoundError('User not found');
  assert.equal(notFound.statusCode, 404);

  const conflict = new ConflictError('Slug already exists');
  assert.equal(conflict.statusCode, 409);

  const validation = new ValidationError('Schema mismatch');
  assert.equal(validation.statusCode, 422);

  assert.ok(badReq instanceof ApiError);
  assert.ok(badReq instanceof Error);
});

test('Foundation — Success and Error Response Envelopes', () => {
  const mockRes = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };

  successResponse(mockRes, { id: 1 }, 201, { total: 1 });
  assert.equal(mockRes.statusCode, 201);
  assert.deepEqual(mockRes.body, {
    success: true,
    data: { id: 1 },
    meta: { total: 1 },
  });

  errorResponse(mockRes, 'Something failed', 400, { issue: 'bad' });
  assert.equal(mockRes.statusCode, 400);
  assert.deepEqual(mockRes.body, {
    success: false,
    error: {
      message: 'Something failed',
      details: { issue: 'bad' },
    },
  });
});

test('Foundation — Health Endpoints & 404 Handler', async () => {
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Live check
    const liveRes = await fetch(`${baseUrl}/health/live`);
    assert.equal(liveRes.status, 200);
    const liveJson = await liveRes.json();
    assert.equal(liveJson.status, 'live');

    // 2. Ready check (verifies database)
    const readyRes = await fetch(`${baseUrl}/health/ready`);
    assert.equal(readyRes.status, 200);
    const readyJson = await readyRes.json();
    assert.equal(readyJson.status, 'ready');
    assert.equal(readyJson.database, 'connected');

    // 3. 404 Route handling
    const notFoundRes = await fetch(`${baseUrl}/api/v1/non-existent-route`);
    assert.equal(notFoundRes.status, 404);
    const notFoundJson = await notFoundRes.json();
    assert.equal(notFoundJson.success, false);
    assert.match(notFoundJson.error.message, /not found/i);
  } finally {
    server.close();
  }
});
