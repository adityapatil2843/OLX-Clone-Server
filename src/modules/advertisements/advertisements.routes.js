import { Router } from 'express';
import * as controller from './advertisements.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import {
  createBoostSchema,
  adIdParamSchema,
  listAdsQuerySchema,
} from './advertisements.validation.js';

const router = Router();

router.use(authenticate);

router
  .route('/')
  .post(validate({ body: createBoostSchema }), controller.createAdvertisement)
  .get(validate({ query: listAdsQuerySchema }), controller.listMyAdvertisements);

router
  .route('/:id')
  .get(validate({ params: adIdParamSchema }), controller.getAdvertisement);

router.post(
  '/:id/cancel',
  validate({ params: adIdParamSchema }),
  controller.cancelAdvertisement
);

// Backward-compatibility endpoint (returns new CANCELLED status)
router.post(
  '/:id/stop',
  validate({ params: adIdParamSchema }),
  controller.stopAdvertisement
);

router.post(
  '/:id/pause',
  validate({ params: adIdParamSchema }),
  controller.pauseAdvertisement
);

export default router;
