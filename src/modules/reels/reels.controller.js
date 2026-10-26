/**
 * Reels controller — HTTP layer only.
 * Parses/validates input, calls service, sends response.
 */

import * as service from './reels.service.js';
import {
  createReelSchema,
  updateReelSchema,
  reelIdParamSchema,
  listReelsQuerySchema,
  uploadRequestSchema,
  createCommentSchema,
  listCommentsQuerySchema,
} from './reels.validation.js';

const ok = (res, data, statusCode = 200, meta) => {
  if (meta) {
    return res.status(statusCode).json({ success: true, data, meta });
  }
  return res.status(statusCode).json({ success: true, data });
};

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
    const result = await service.listReels(query, req.user?.id);
    ok(res, result.data, 200, result.meta);
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/reels/:reelId ─────────────────────────────────

export const getReelById = async (req, res, next) => {
  try {
    const { reelId } = parseOrThrow(reelIdParamSchema, req.params);
    const reel = await service.getReelById(reelId, req.user?.id);
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

// ── POST /api/v1/reels/:reelId/upload ─────────────────────────

export const uploadReelDirect = async (req, res, next) => {
  try {
    const { reelId } = parseOrThrow(reelIdParamSchema, req.params);
    const videoFile = req.files?.video?.[0] || req.files?.file?.[0] || req.files?.media?.[0] || req.file;
    const thumbnailFile = req.files?.thumbnail?.[0] || null;

    const reel = await service.uploadReelDirect(
      reelId,
      req.creatorId,
      videoFile,
      thumbnailFile
    );
    ok(res, reel, 201);
  } catch (err) {
    next(err);
  }
};


// ── Engagement Handlers ────────────────────────────────────────

export const likeReel = async (req, res, next) => {
  try {
    const { reelId } = parseOrThrow(reelIdParamSchema, req.params);
    const result = await service.likeReel(reelId, req.user.id);
    ok(res, result);
  } catch (err) {
    next(err);
  }
};

export const unlikeReel = async (req, res, next) => {
  try {
    const { reelId } = parseOrThrow(reelIdParamSchema, req.params);
    const result = await service.unlikeReel(reelId, req.user.id);
    ok(res, result);
  } catch (err) {
    next(err);
  }
};

export const saveReel = async (req, res, next) => {
  try {
    const { reelId } = parseOrThrow(reelIdParamSchema, req.params);
    const result = await service.saveReel(reelId, req.user.id);
    ok(res, result);
  } catch (err) {
    next(err);
  }
};

export const unsaveReel = async (req, res, next) => {
  try {
    const { reelId } = parseOrThrow(reelIdParamSchema, req.params);
    const result = await service.unsaveReel(reelId, req.user.id);
    ok(res, result);
  } catch (err) {
    next(err);
  }
};

export const addComment = async (req, res, next) => {
  try {
    const { reelId } = parseOrThrow(reelIdParamSchema, req.params);
    const { text } = parseOrThrow(createCommentSchema, req.body);
    const comment = await service.addComment(reelId, req.user.id, text);
    ok(res, comment, 201);
  } catch (err) {
    next(err);
  }
};

export const getComments = async (req, res, next) => {
  try {
    const { reelId } = parseOrThrow(reelIdParamSchema, req.params);
    const query = parseOrThrow(listCommentsQuerySchema, req.query);
    const result = await service.getComments(reelId, query);
    ok(res, result.data, 200, result.meta);
  } catch (err) {
    next(err);
  }
};
