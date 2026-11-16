/**
 * Cloudinary Webhook Handler for Reels.
 *
 * Verifies HMAC signatures using Cloudinary SDK's verifyNotificationSignature,
 * rejects stale and replayed notifications, enforces file size limits,
 * ensures database-backed idempotent processing, and finalizes Reel and MediaAsset upload states.
 */

import { v2 as cloudinary } from 'cloudinary';
import * as repo from './reels.repository.js';
import { logger } from '../../config/logger.js';
import { isConfigured } from '../../integrations/storage/cloudinary.service.js';

const VALID_FOR_SECONDS = 7200; // 2 hours

/**
 * Express handler for Cloudinary webhooks.
 * Expects raw body (Buffer or string) from express.raw().
 */
export const handleCloudinaryWebhook = async (req, res) => {
  const timestampHeader = req.headers['x-cld-timestamp'];
  const signatureHeader = req.headers['x-cld-signature'];

  if (!timestampHeader || !signatureHeader) {
    logger.warn('[Cloudinary Webhook] Rejected: Missing signature headers', {
      headers: req.headers,
    });
    return res.status(401).json({
      success: false,
      message: 'Missing required Cloudinary webhook signature headers (X-Cld-Timestamp, X-Cld-Signature)',
    });
  }

  const numericTimestamp = Number(timestampHeader);
  const now = Math.round(Date.now() / 1000);

  // 1. Stale or future timestamp validation
  if (
    isNaN(numericTimestamp) ||
    numericTimestamp < now - VALID_FOR_SECONDS ||
    numericTimestamp > now + 300
  ) {
    logger.warn('[Cloudinary Webhook] Rejected: Stale or invalid timestamp', {
      timestamp: numericTimestamp,
      now,
    });
    return res.status(401).json({
      success: false,
      message: 'Stale or invalid webhook timestamp',
    });
  }

  // Extract raw body string for cryptographic verification
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : typeof req.body === 'string'
    ? req.body
    : JSON.stringify(req.body);

  // 2. Cryptographic signature verification using Cloudinary SDK
  if (isConfigured) {
    const isValid = cloudinary.utils.verifyNotificationSignature(
      rawBody,
      numericTimestamp,
      signatureHeader,
      VALID_FOR_SECONDS
    );

    if (!isValid) {
      logger.warn('[Cloudinary Webhook] Rejected: Invalid HMAC signature', {
        timestamp: numericTimestamp,
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid webhook signature',
      });
    }
  }

  // 3. Database-backed replay & idempotency check
  const isNewEvent = await repo.recordWebhookEvent(signatureHeader);
  if (!isNewEvent) {
    logger.info('[Cloudinary Webhook] Idempotent: Webhook signature already recorded in database', {
      signature: signatureHeader,
    });
    return res.status(200).json({
      success: true,
      message: 'Already processed (duplicate webhook)',
    });
  }

  // 4. Parse payload
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (parseErr) {
    logger.error('[Cloudinary Webhook] Malformed JSON payload', { err: parseErr.message });
    return res.status(400).json({ success: false, message: 'Malformed JSON payload' });
  }

  // Ignore non-upload notification types (e.g. delete, rename)
  if (payload.notification_type && payload.notification_type !== 'upload') {
    logger.info('[Cloudinary Webhook] Non-upload event ignored', {
      type: payload.notification_type,
    });
    return res.status(200).json({ success: true, message: 'Event ignored' });
  }

  const {
    asset_id,
    public_id,
    bytes,
    format,
    duration,
    width,
    height,
    resource_type,
    secure_url,
    url,
    context,
  } = payload;

  const resolvedUrl = secure_url || url;
  const actualBytes = Number(bytes) || 0;

  // 5. Authoritative file size enforcement (500 MB limit)
  const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
  if (actualBytes > MAX_FILE_SIZE) {
    logger.error('[Cloudinary Webhook] Uploaded video exceeds authoritative 500 MB limit', {
      public_id,
      actualBytes,
      limit: MAX_FILE_SIZE,
    });

    const parsedReelId = context?.custom?.reelId || public_id?.split('/').pop();
    const parsedUploadToken = context?.custom?.uploadToken;
    if (parsedReelId) {
      await repo.markMediaAssetFailed(parsedReelId, parsedUploadToken);
    }

    return res.status(400).json({
      success: false,
      message: `Uploaded video exceeds 500 MB limit (${actualBytes} bytes)`,
    });
  }

  // 5b. Authoritative duration enforcement (120 seconds / 2 minutes limit)
  const MAX_DURATION_SECONDS = 120;
  if (duration && Number(duration) > MAX_DURATION_SECONDS) {
    logger.error('[Cloudinary Webhook] Uploaded video exceeds authoritative 120 seconds limit', {
      public_id,
      duration,
      limit: MAX_DURATION_SECONDS,
    });

    const parsedReelId = context?.custom?.reelId || public_id?.split('/').pop();
    const parsedUploadToken = context?.custom?.uploadToken;
    if (parsedReelId) {
      await repo.markMediaAssetFailed(parsedReelId, parsedUploadToken);
    }

    return res.status(400).json({
      success: false,
      message: `Uploaded video exceeds 2 minutes limit (${duration} seconds)`,
    });
  }

  // 6. Extract server-generated metadata association
  let reelId = context?.custom?.reelId;
  let uploadToken = context?.custom?.uploadToken;

  if (!reelId && public_id) {
    const segments = public_id.split('/');
    if (segments.length >= 3 && segments[0] === 'reels') {
      reelId = segments[2];
    } else if (segments.length === 2 && segments[0] === 'reels') {
      reelId = segments[1];
    }
  }

  if (!reelId) {
    logger.warn('[Cloudinary Webhook] Could not determine reel ID from webhook payload', {
      public_id,
      context,
    });
    return res.status(422).json({
      success: false,
      message: 'Unable to associate upload with a Reel record',
    });
  }

  // 7. Locate target Reel
  const reel = await repo.findReelById(reelId);
  if (!reel) {
    logger.warn('[Cloudinary Webhook] Reel record not found', { reelId });
    return res.status(404).json({ success: false, message: `Reel ${reelId} not found` });
  }

  // 8. Verify upload token association if present
  if (uploadToken && reel.mediaAssetId && reel.mediaAssetId !== uploadToken) {
    logger.error('[Cloudinary Webhook] Upload token mismatch against Reel record', {
      expected: reel.mediaAssetId,
      received: uploadToken,
      reelId,
    });
    return res.status(403).json({
      success: false,
      message: 'Upload token does not match server session',
    });
  }

  // 9. Finalize MediaAsset and Reel records in database within a transaction
  const posterUrl = resolvedUrl ? resolvedUrl.replace(/\.[^.]+$/, '.jpg') : null;
  const durationMs = duration ? Math.round(Number(duration) * 1000) : null;
  const mimeType = resource_type && format ? `${resource_type}/${format}` : 'video/mp4';

  try {
    const result = await repo.finalizeMediaAssetAndReel({
      reelId: reel.id,
      mediaAssetId: uploadToken || reel.mediaAssetId,
      storageKey: resolvedUrl || public_id,
      thumbnailKey: posterUrl,
      durationMs,
      width: width || 1080,
      height: height || 1920,
      sizeBytes: actualBytes,
      mimeType,
      signature: signatureHeader,
    });

    if (result.isDuplicate) {
      return res.status(200).json({
        success: true,
        message: 'Already processed (duplicate webhook)',
      });
    }

    logger.info('[Cloudinary Webhook] Reel and MediaAsset upload finalized successfully', {
      reelId: reel.id,
      assetId: asset_id,
      publicId: public_id,
      bytes: actualBytes,
      visibilityState: result.reel.visibilityState,
    });

    return res.status(200).json({
      success: true,
      message: 'Reel upload finalized successfully',
      data: {
        reelId: reel.id,
        visibilityState: result.reel.visibilityState,
        mediaAssetId: result.asset.id,
      },
    });
  } catch (dbErr) {
    logger.error('[Cloudinary Webhook] Database transaction failed while finalizing upload', {
      err: dbErr.message,
      reelId: reel.id,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to update database records',
    });
  }
};
