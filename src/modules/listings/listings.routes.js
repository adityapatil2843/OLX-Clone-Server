import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './listings.controller.js';
import {
  attachMediaSchema,
  createListingSchema,
  listingIdParamSchema,
  myListingsQuerySchema,
  publicListingsQuerySchema,
  updateListingSchema,
  updateListingStatusSchema,
  uploadSignatureSchema,
} from './listings.validation.js';

import { uploadMedia } from '../../middlewares/upload.js';
import { BadRequestError } from '../../utils/errors.js';
import { uploadBufferToCloudinary } from '../reels/reels.storage.js';

const router = Router();

router.get('/', optionalAuthenticate, validate({ query: publicListingsQuerySchema }), controller.listPublicListings);
router.get('/mine', authenticate, validate({ query: myListingsQuerySchema }), controller.listMyListings);

// Direct single-request creation with optional image file(s) or standard JSON
router.post(
  '/',
  authenticate,
  uploadMedia.fields([
    { name: 'file', maxCount: 1 },
    { name: 'image', maxCount: 1 },
    { name: 'images', maxCount: 12 },
  ]),
  validate({ body: createListingSchema }),
  controller.createListing
);

// Quick test route to verify Cloudinary upload functionality via Postman
router.post(
  '/test-upload',
  authenticate,
  uploadMedia.fields([
    { name: 'file', maxCount: 1 },
    { name: 'image', maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const file = req.file || req.files?.file?.[0] || req.files?.image?.[0];
      if (!file) {
        throw new BadRequestError('No file provided in form-data (use field name "file" or "image")');
      }
      const isVideo = (file.mimetype || '').startsWith('video/');
      const resourceType = isVideo ? 'video' : 'image';
      const uploaded = await uploadBufferToCloudinary(file.buffer, {
        resourceType,
        folder: `test-uploads/${req.user.id}`,
      });
      res.status(200).json({
        success: true,
        message: 'File successfully uploaded to Cloudinary!',
        cloudinary: {
          public_id: uploaded.public_id,
          secure_url: uploaded.secure_url,
          format: uploaded.format,
          bytes: uploaded.bytes,
          resource_type: uploaded.resource_type,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/:listingId', optionalAuthenticate, validate({ params: listingIdParamSchema }), controller.getPublicListing);
router.patch('/:listingId', authenticate, validate({ params: listingIdParamSchema, body: updateListingSchema }), controller.updateListing);
router.patch('/:listingId/status', authenticate, validate({ params: listingIdParamSchema, body: updateListingStatusSchema }), controller.updateListingStatus);
router.delete('/:listingId', authenticate, validate({ params: listingIdParamSchema }), controller.deleteListing);
router.post('/:listingId/media/upload-signature', authenticate, validate({ params: listingIdParamSchema, body: uploadSignatureSchema }), controller.requestMediaUpload);
router.post(
  '/:listingId/media/upload',
  authenticate,
  uploadMedia.fields([
    { name: 'file', maxCount: 12 },
    { name: 'files', maxCount: 12 },
    { name: 'image', maxCount: 12 },
    { name: 'images', maxCount: 12 },
  ]),
  controller.uploadMediaDirect
);
router.delete('/:listingId/media/:mediaId', authenticate, controller.deleteMedia);
router.post('/:listingId/media', authenticate, validate({ params: listingIdParamSchema, body: attachMediaSchema }), controller.attachMedia);

export default router;
