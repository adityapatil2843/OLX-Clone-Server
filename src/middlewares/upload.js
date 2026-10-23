import multer from 'multer';
import { BadRequestError } from '../utils/errors.js';

// Use memory storage so buffers can be streamed straight to Cloudinary/S3
const storage = multer.memoryStorage();

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/x-matroska',
  'video/avi',
  'video/3gpp',
  'video/ogg',
  'video/mpeg',
  'video/m4v',
]);

const extensionMimeMap = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.3gp': 'video/3gpp',
  '.m4v': 'video/m4v',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
};

const fileFilter = (_req, file, cb) => {
  if (allowedMimeTypes.has(file.mimetype) || (file.mimetype && file.mimetype.startsWith('video/'))) {
    cb(null, true);
    return;
  }

  // Fallback for clients sending generic application/octet-stream or non-standard mime types
  const lowerOriginalName = (file.originalname || '').toLowerCase();
  const matchedExt = Object.keys(extensionMimeMap).find((ext) => lowerOriginalName.endsWith(ext));
  if (matchedExt) {
    file.mimetype = extensionMimeMap[matchedExt];
    cb(null, true);
    return;
  }

  cb(new BadRequestError(`Unsupported file format '${file.mimetype}'. Allowed: images (jpeg, jpg, png, webp, gif) and videos (mp4, mov, webm, avi, mkv, 3gp, m4v, etc.).`), false);
};

export const uploadMedia = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max limit
  },
});
