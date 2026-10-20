import { Router } from 'express';
import * as controller from './users.controller.js';
import { validate } from '../../middlewares/validate.js';
import {
  userIdParamSchema,
  updateProfileSchema,
  listUsersQuerySchema,
} from './users.validation.js';
import { authenticate, optionalAuthenticate } from '../../middlewares/authenticate.js';

const router = Router();

// GET /api/v1/users - paginated public user discovery
router.get(
  '/',
  validate({ query: listUsersQuerySchema }),
  controller.listUsers
);

// GET /api/v1/users/:userId - user profile (isSelf gets extended profile)
router.get(
  '/:userId',
  optionalAuthenticate,
  validate({ params: userIdParamSchema }),
  controller.getUserById
);

// PATCH /api/v1/users/:userId/profile - update user profile (ownership enforced)
router.patch(
  '/:userId/profile',
  authenticate,
  validate({ params: userIdParamSchema, body: updateProfileSchema }),
  controller.updateProfile
);

export default router;
