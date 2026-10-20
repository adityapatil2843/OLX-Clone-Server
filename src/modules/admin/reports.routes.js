import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { createReportSchema } from './admin.validation.js';
import * as controller from './admin.controller.js';

const router = Router();

router.post(
  '/',
  authenticate,
  validate({ body: createReportSchema }),
  controller.fileReport
);

export default router;
