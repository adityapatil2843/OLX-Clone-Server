import { Router } from 'express';
import * as controller from './categories.controller.js';
import { validate } from '../../middlewares/validate.js';
import {
  createCategorySchema,
  updateCategorySchema,
  categoryIdOrSlugParamSchema,
  listCategoriesQuerySchema,
} from './categories.validation.js';
import { z } from 'zod';

const router = Router();

const categoryIdParamSchema = z.object({
  id: z.string().uuid('Category ID must be a valid UUID'),
});

// ── Public Category Discovery ─────────────────────────────────

// GET /api/v1/categories - list active categories (flat or tree)
router.get(
  '/',
  validate({ query: listCategoriesQuerySchema }),
  controller.listCategories
);

// GET /api/v1/categories/:idOrSlug - get category by ID or slug
router.get(
  '/:idOrSlug',
  validate({ params: categoryIdOrSlugParamSchema }),
  controller.getCategory
);

// ── Administrative Category Management ────────────────────────
// Note: When full authentication is wired, requireRole(['ADMIN'])
// will guard these mutations.
router.post(
  '/',
  validate({ body: createCategorySchema }),
  controller.createCategory
);

router.patch(
  '/:id',
  validate({ params: categoryIdParamSchema, body: updateCategorySchema }),
  controller.updateCategory
);

router.delete(
  '/:id',
  validate({ params: categoryIdParamSchema }),
  controller.deactivateCategory
);

export default router;
