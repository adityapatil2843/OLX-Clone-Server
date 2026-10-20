import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './wishlist.controller.js';
import { listingIdParamSchema, wishlistQuerySchema } from './wishlist.validation.js';

const router = Router();

router.use(authenticate);
router.get('/', validate({ query: wishlistQuerySchema }), controller.listWishlist);
router.post('/:listingId', validate({ params: listingIdParamSchema }), controller.addToWishlist);
router.delete('/:listingId', validate({ params: listingIdParamSchema }), controller.removeFromWishlist);

export default router;
