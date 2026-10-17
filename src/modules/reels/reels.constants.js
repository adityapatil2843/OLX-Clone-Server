/**
 * Reels module constants.
 * Import from here rather than repeating magic strings.
 */

export const REEL_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PROCESSING: 'PROCESSING',
  PUBLISHED: 'PUBLISHED',
  FAILED: 'FAILED',
  ARCHIVED: 'ARCHIVED',
});

/** Fields a client is allowed to update via PATCH */
export const REEL_UPDATABLE_FIELDS = Object.freeze([
  'caption',
  'hashtags',
  'categoryId',
  'locationText',
  'listingId',
]);

export const PAGINATION = Object.freeze({
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
});

export const REEL_PROVIDER = Object.freeze({
  CLOUDINARY: 'cloudinary',
  SUPABASE: 'supabase-storage',
  LOCAL: 'local', // dev-only placeholder
});
