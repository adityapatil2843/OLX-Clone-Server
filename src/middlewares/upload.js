import multer from 'multer';
import { BadRequestError } from '../utils/errors.js';

// Use memory storage so buffers can be streamed straight to Cloudinary/S3
const storage = multer.memoryStorage();

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

const fileFilter = (_req, file, cb) => {
  if (allowedMimeTypes.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestError(`Unsupported file format '${file.mimetype}'. Allowed: images (jpeg, png, webp, gif) and videos (mp4, mov, webm).`), false);
  }
};

export const uploadMedia = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max limit
  },
});
