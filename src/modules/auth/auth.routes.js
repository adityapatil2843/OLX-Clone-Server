import { Router } from 'express';
import * as controller from './auth.controller.js';
import { validate } from '../../middlewares/validate.js';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
} from './auth.validation.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authLimiter } from '../../middlewares/rateLimiter.js';

const router = Router();

// Apply auth rate limiting to registration and login
router.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  controller.register
);

router.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  controller.login
);

router.post(
  '/refresh',
  validate({ body: refreshSchema }),
  controller.refresh
);

router.post(
  '/logout',
  validate({ body: logoutSchema }),
  controller.logout
);

router.get(
  '/me',
  authenticate,
  controller.getMe
);

export default router;
