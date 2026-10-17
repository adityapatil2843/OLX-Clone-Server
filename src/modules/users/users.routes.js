import { Router } from 'express';
import * as controller from './users.controller.js';
import { validate } from '../../middlewares/validate.js';
import {
  userIdParamSchema,
  updateProfileSchema,
  listUsersQuerySchema,
} from './users.validation.js';

const router = Router();

// GET /api/v1/users - paginated public user discovery
router.get(
  '/',
  validate({ query: listUsersQuerySchema }),
  controller.listUsers
);

// GET /api/v1/users/:userId - public user profile
router.get(
  '/:userId',
  validate({ params: userIdParamSchema }),
  controller.getUserById
);

// PATCH /api/v1/users/:userId/profile - update user profile
// Note: When full auth is implemented, the current authenticated user's ID
// will be enforced so users can only edit their own profile.
router.patch(
  '/:userId/profile',
  validate({ params: userIdParamSchema, body: updateProfileSchema }),
  controller.updateProfile
);

export default router;
