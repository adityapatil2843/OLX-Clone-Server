/**
 * Reels routes — versioned REST endpoints under /api/v1/reels
 */

import { Router } from 'express';
import * as controller from './reels.controller.js';
import { authenticate, optionalAuthenticate } from '../../middlewares/authenticate.js';
import { uploadMedia } from '../../middlewares/upload.js';

const router = Router();

// ── Feed & Creation ───────────────────────────────────────────

router.get('/', optionalAuthenticate, controller.listReels);
router.post('/', authenticate, controller.createReel);

// ── Single Reel ───────────────────────────────────────────────

router.get('/:reelId', optionalAuthenticate, controller.getReelById);
router.patch('/:reelId', authenticate, controller.updateReel);
router.delete('/:reelId', authenticate, controller.deleteReel);

// ── Upload Lifecycle ──────────────────────────────────────────

router.post('/:reelId/upload-url', authenticate, controller.requestUploadUrl);
router.post(
  '/:reelId/upload',
  authenticate,
  uploadMedia.fields([
    { name: 'video', maxCount: 1 },
    { name: 'file', maxCount: 1 },
    { name: 'media', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  controller.uploadReelDirect
);
router.post('/:reelId/confirm-upload', authenticate, controller.confirmUpload);

// ── Engagement: Likes & Saves ──────────────────────────────────

router.post('/:reelId/like', authenticate, controller.likeReel);
router.delete('/:reelId/like', authenticate, controller.unlikeReel);

router.post('/:reelId/save', authenticate, controller.saveReel);
router.delete('/:reelId/save', authenticate, controller.unsaveReel);

// ── Engagement: Comments ───────────────────────────────────────

router.get('/:reelId/comments', optionalAuthenticate, controller.getComments);
router.post('/:reelId/comments', authenticate, controller.addComment);

export default router;
