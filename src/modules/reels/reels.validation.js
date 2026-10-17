/**
 * Reels request validation.
 * Uses Zod v4. Each exported schema covers one route's inputs.
 */

import { z } from 'zod';
import { REEL_STATUS, PAGINATION } from './reels.constants.js';

// ── helpers ──────────────────────────────────────────────────

const uuid = z.string().uuid({ message: 'Must be a valid UUID' });

const hashtags = z
  .array(z.string().min(1).max(100))
  .max(30, 'Maximum 30 hashtags')
  .optional()
  .default([]);

// ── Create ────────────────────────────────────────────────────

export const createReelSchema = z.object({
  caption: z.string().max(2200, 'Caption too long').optional(),
  hashtags,
  categoryId: z.string().uuid().optional(),
  locationText: z.string().max(200).optional(),
  listingId: z.string().uuid().optional(),
  // Media metadata — supplied by client after upload or for stub testing
  videoStorageKey: z.string().max(500).optional(),
  thumbnailStorageKey: z.string().max(500).optional(),
  videoProvider: z.string().max(50).optional(),
  durationMs: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

// ── Update (PATCH — partial) ──────────────────────────────────

export const updateReelSchema = z
  .object({
    caption: z.string().max(2200).optional(),
    hashtags,
    categoryId: z.string().uuid().optional().nullable(),
    locationText: z.string().max(200).optional().nullable(),
    listingId: z.string().uuid().optional().nullable(),
  })
  .strict();  // reject unknown keys

// ── Route params ─────────────────────────────────────────────

export const reelIdParamSchema = z.object({
  reelId: uuid,
});

// ── List query ────────────────────────────────────────────────

export const listReelsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .pipe(z.number().int().min(1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : PAGINATION.DEFAULT_LIMIT))
    .pipe(z.number().int().min(1).max(PAGINATION.MAX_LIMIT)),
  status: z
    .enum(Object.values(REEL_STATUS))
    .optional()
    .default(REEL_STATUS.PUBLISHED),
  creatorId: z.string().min(1).max(100).optional(),
});

// ── Signed upload request ─────────────────────────────────────

export const uploadRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.enum(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo']),
  fileSizeBytes: z.number().int().positive().max(500 * 1024 * 1024, 'Max 500 MB'),
});
