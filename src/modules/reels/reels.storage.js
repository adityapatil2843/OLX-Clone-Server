/**
 * Cloudinary storage abstraction for Reels.
 *
 * Usage in development without real keys:
 *   Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 *   in .env. If any are missing, the module falls back to a stub that
 *   lets you test all CRUD endpoints without actual uploads.
 *
 * This file is the only place that imports cloudinary.
 * Swap this file to change providers.
 */

import { v2 as cloudinary } from 'cloudinary';

// ── Configuration ─────────────────────────────────────────────

const isConfigured = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (isConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

// ── Signed upload parameters ──────────────────────────────────

/**
 * Generate a short-lived signed upload signature.
 * The client uses these params to upload directly to Cloudinary
 * without exposing the API secret.
 *
 * @param {object} opts
 * @param {string} opts.reelId     Used as the public_id prefix
 * @param {string} opts.creatorId
 * @returns {{ signature, timestamp, apiKey, cloudName, folder, publicId, uploadPreset? }}
 */
export const generateUploadSignature = (opts) => {
  if (!isConfigured) {
    // Stub response for local development without real credentials
    return {
      stub: true,
      message: 'Cloudinary not configured — stub upload params returned',
      publicId: `reels/${opts.creatorId}/${opts.reelId}`,
      uploadUrl: `https://api.cloudinary.com/v1_1/UNCONFIGURED/video/upload`,
    };
  }

  const folder = `reels/${opts.creatorId}`;
  const publicId = `${folder}/${opts.reelId}`;
  const timestamp = Math.round(Date.now() / 1000);

  const paramsToSign = {
    folder,
    public_id: publicId,
    timestamp,
    resource_type: 'video',
    overwrite: false,
  };

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET
  );

  return {
    signature,
    timestamp,
    apiKey: process.env.CLOUDINARY_API_KEY,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    folder,
    publicId,
    uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload`,
  };
};

/**
 * Signed direct upload parameters for listing images and videos.
 * Kept alongside Reel storage so all Cloudinary configuration stays in one place.
 */
export const generateListingUploadSignature = ({ listingId, ownerId, type }) => {
  const resourceType = type === 'IMAGE' ? 'image' : 'video';
  const folder = `listings/${ownerId}/${listingId}`;
  const publicId = `${folder}/${Date.now()}`;

  if (!isConfigured) {
    return {
      stub: true,
      message: 'Cloudinary not configured — stub upload params returned',
      publicId,
      uploadUrl: `https://api.cloudinary.com/v1_1/UNCONFIGURED/${resourceType}/upload`,
    };
  }

  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = {
    folder,
    public_id: publicId,
    timestamp,
    resource_type: resourceType,
    overwrite: false,
  };

  return {
    signature: cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET),
    timestamp,
    apiKey: process.env.CLOUDINARY_API_KEY,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    folder,
    publicId,
    resourceType,
    uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
  };
};

// ── Secure delivery URL ───────────────────────────────────────

/**
 * Build a signed (expiring) delivery URL for a stored video.
 * Never expose storage keys or API secrets to the client.
 *
 * @param {string} storageKey  The publicId stored in the database
 * @param {number} [expiresInSec=3600]
 * @returns {string} Signed URL
 */
export const getSignedDeliveryUrl = (storageKey, expiresInSec = 3600) => {
  if (!isConfigured) {
    return `https://placeholder.cloudinary.com/${storageKey}`;
  }

  return cloudinary.url(storageKey, {
    resource_type: 'video',
    type: 'upload',
    secure: true,
    sign_url: true,
    expires_at: Math.round(Date.now() / 1000) + expiresInSec,
  });
};

/** Builds a delivery URL for marketplace image or video media. */
export const getListingMediaDeliveryUrl = (storageKey, type, expiresInSec = 3600) => {
  const resourceType = type === 'IMAGE' ? 'image' : 'video';
  if (!isConfigured) {
    return `https://placeholder.cloudinary.com/${storageKey}`;
  }

  return cloudinary.url(storageKey, {
    resource_type: resourceType,
    type: 'upload',
    secure: true,
    sign_url: true,
    expires_at: Math.round(Date.now() / 1000) + expiresInSec,
  });
};

// ── Delete from storage ───────────────────────────────────────

/**
 * Remove a resource from Cloudinary.
 * Called when a Reel is hard-deleted (admin use only, not exposed in API).
 *
 * @param {string} storageKey
 */
export const deleteFromStorage = async (storageKey) => {
  if (!isConfigured) {
    console.warn('[Storage] Cloudinary not configured — skipping delete:', storageKey);
    return { result: 'not_configured' };
  }
  return cloudinary.uploader.destroy(storageKey, { resource_type: 'video' });
};

export { isConfigured };
