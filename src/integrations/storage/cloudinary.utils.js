/**
 * Focused Cloudinary URL optimization utility.
 * Optimizes Cloudinary-hosted images and video thumbnails with f_auto,q_auto.
 * Preserves existing transformations, dimensions, crop behavior, and secure URLs.
 * Never modifies non-Cloudinary URLs or video streams (.mp4, .m3u8).
 */

const CLOUDINARY_HOST_REGEX = /(?:res\.cloudinary\.com|cloudinary\.com)/i;
const VIDEO_STREAM_REGEX = /\.(mp4|m3u8)($|\?)/i;
const IMAGE_EXT_REGEX = /\.(jpg|jpeg|png|webp|avif|gif)($|\?)/i;

/**
 * Optimizes a Cloudinary image or video thumbnail delivery URL by applying f_auto,q_auto.
 *
 * @param {string} url - Candidate URL
 * @param {object} [options]
 * @returns {string} Optimized URL or original URL
 */
export function optimizeCloudinaryUrl(url, options = {}) {
  if (!url || typeof url !== 'string') return url;

  // 1. Only transform Cloudinary URLs
  if (!CLOUDINARY_HOST_REGEX.test(url)) {
    return url;
  }

  // 2. Do not modify video playback streams (e.g. .mp4, .m3u8) unless ending with an image extension (video thumbnail)
  if (VIDEO_STREAM_REGEX.test(url) && !IMAGE_EXT_REGEX.test(url)) {
    return url;
  }

  // 3. Locate the '/upload/' segment
  const uploadIndex = url.indexOf('/upload/');
  if (uploadIndex === -1) {
    return url;
  }

  const prefix = url.substring(0, uploadIndex + 8); // includes '/upload/'
  const rest = url.substring(uploadIndex + 8);

  // 4. If already fully optimized, return as is
  if (rest.includes('f_auto') && rest.includes('q_auto')) {
    return url;
  }

  const firstSlashIndex = rest.indexOf('/');
  if (firstSlashIndex !== -1) {
    const firstSegment = rest.substring(0, firstSlashIndex);
    const isVersion = /^v\d+$/.test(firstSegment);
    
    // A transformation segment typically starts with standard Cloudinary prefixes or contains commas
    const isTransformation =
      !isVersion &&
      (firstSegment.includes(',') ||
        /^(c|w|h|q|f|so|e|b|r|a|co|pg|fl|ar|dpr|t)_/.test(firstSegment));

    if (isTransformation) {
      const parts = firstSegment.split(',');
      if (!parts.includes('f_auto')) parts.push('f_auto');
      if (!parts.includes('q_auto')) parts.push('q_auto');
      return `${prefix}${parts.join(',')}/${rest.substring(firstSlashIndex + 1)}`;
    }
  }

  // 5. No transformation segment present; inject f_auto,q_auto
  return `${prefix}f_auto,q_auto/${rest}`;
}

