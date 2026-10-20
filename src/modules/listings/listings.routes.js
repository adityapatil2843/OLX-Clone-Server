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

const router = Router();

router.get('/', optionalAuthenticate, validate({ query: publicListingsQuerySchema }), controller.listPublicListings);
router.get('/mine', authenticate, validate({ query: myListingsQuerySchema }), controller.listMyListings);
router.post('/', authenticate, validate({ body: createListingSchema }), controller.createListing);
router.get('/:listingId', optionalAuthenticate, validate({ params: listingIdParamSchema }), controller.getPublicListing);
router.patch('/:listingId', authenticate, validate({ params: listingIdParamSchema, body: updateListingSchema }), controller.updateListing);
router.patch('/:listingId/status', authenticate, validate({ params: listingIdParamSchema, body: updateListingStatusSchema }), controller.updateListingStatus);
router.delete('/:listingId', authenticate, validate({ params: listingIdParamSchema }), controller.deleteListing);
router.post('/:listingId/media/upload-signature', authenticate, validate({ params: listingIdParamSchema, body: uploadSignatureSchema }), controller.requestMediaUpload);
router.post('/:listingId/media', authenticate, validate({ params: listingIdParamSchema, body: attachMediaSchema }), controller.attachMedia);

export default router;
