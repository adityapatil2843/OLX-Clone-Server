/**
 * Reels controller — HTTP layer only.
 * Parses/validates input, calls service, sends response.
 * No business logic lives here.
 */

import * as service from './reels.service.js';
import {
  createReelSchema,
  updateReelSchema,
  reelIdParamSchema,
  listReelsQuerySchema,
  uploadRequestSchema,
} from './reels.validation.js';

// ── Helper: send a consistent success envelope ─────────────────

const ok = (res, data, statusCode = 200) =>
  res.status(statusCode).json({ success: true, data });

// ── Helper: parse with Zod and forward errors ─────────────────

const parseOrThrow = (schema, input) => {
  const result = schema.safeParse(input);
  if (!result.success) {
    const err = new Error('Validation failed');
    err.statusCode = 422;
    err.details = result.error.flatten();
    throw err;
  }
  return result.data;
};

// ── POST /api/v1/reels ────────────────────────────────────────

export const createReel = async (req, res, next) => {
  try {
    const body = parseOrThrow(createReelSchema, req.body);
    const reel = await service.createReel(body, req.creatorId);
    ok(res, reel, 201);
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/reels ─────────────────────────────────────────

export const listReels = async (req, res, next) => {
  try {
    const query = parseOrThrow(listReelsQuerySchema, req.query);
    const result = await service.listReels(query);
    ok(res, result);
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/reels/:reelId ─────────────────────────────────

export const getReelById = async (req, res, next) => {
  try {
    const { reelId } = parseOrThrow(reelIdParamSchema, req.params);
    const reel = await service.getReelById(reelId);
    ok(res, reel);
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/v1/reels/:reelId ───────────────────────────────

export const updateReel = async (req, res, next) => {
  try {
    const { reelId } = parseOrThrow(reelIdParamSchema, req.params);
    const body = parseOrThrow(updateReelSchema, req.body);
    const reel = await service.updateReel(reelId, body, req.creatorId);
    ok(res, reel);
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/v1/reels/:reelId ──────────────────────────────

export const deleteReel = async (req, res, next) => {
  try {
    const { reelId } = parseOrThrow(reelIdParamSchema, req.params);
    await service.deleteReel(reelId, req.creatorId);
    ok(res, { message: 'Reel archived successfully' });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/reels/:reelId/upload-url ─────────────────────

export const requestUploadUrl = async (req, res, next) => {
  try {
    const { reelId } = parseOrThrow(reelIdParamSchema, req.params);
    // Validate the upload metadata the client describes
    parseOrThrow(uploadRequestSchema, req.body);
    const params = service.requestUpload(reelId, req.creatorId);
    ok(res, params);
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/reels/:reelId/confirm-upload ─────────────────

export const confirmUpload = async (req, res, next) => {
  try {
    const { reelId } = parseOrThrow(reelIdParamSchema, req.params);
    const {
      videoStorageKey,
      thumbnailStorageKey,
      videoProvider,
      durationMs,
      width,
      height,
    } = req.body;

    const reel = await service.confirmUpload(
      reelId,
      { videoStorageKey, thumbnailStorageKey, videoProvider, durationMs, width, height },
      req.creatorId
    );
    ok(res, reel);
  } catch (err) {
    next(err);
  }
};
