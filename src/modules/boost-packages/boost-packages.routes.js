import { Router } from 'express';
import * as controller from './boost-packages.controller.js';
import { validate } from '../../middlewares/validate.js';
import { boostPackageIdParamSchema } from './boost-packages.validation.js';

const router = Router();

router.get('/', controller.listPackages);
router.get('/:id', validate({ params: boostPackageIdParamSchema }), controller.getPackage);

export default router;
