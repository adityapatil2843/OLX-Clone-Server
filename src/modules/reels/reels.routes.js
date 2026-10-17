/**
 * Reels routes — versioned REST endpoints under /api/v1/reels
 */

import { Router } from 'express';
import * as controller from './reels.controller.js';

const router = Router();

// ── Feed & creation ───────────────────────────────────────────

// GET  /api/v1/reels          → paginated feed
// POST /api/v1/reels          → create a new Reel record
router.route('/').get(controller.listReels).post(controller.createReel);

// ── Single Reel ───────────────────────────────────────────────

// GET    /api/v1/reels/:reelId  → get one Reel
// PATCH  /api/v1/reels/:reelId  → update allowed metadata
// DELETE /api/v1/reels/:reelId  → soft-delete / archive
router
  .route('/:reelId')
  .get(controller.getReelById)
  .patch(controller.updateReel)
  .delete(controller.deleteReel);

// ── Upload lifecycle ──────────────────────────────────────────

// POST /api/v1/reels/:reelId/upload-url    → get signed upload params
// POST /api/v1/reels/:reelId/confirm-upload → confirm upload done
router.post('/:reelId/upload-url', controller.requestUploadUrl);
router.post('/:reelId/confirm-upload', controller.confirmUpload);

export default router;
