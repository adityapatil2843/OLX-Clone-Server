import { z } from 'zod';
import { CATEGORY_PAGINATION } from './categories.constants.js';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createCategorySchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(slugRegex, 'Slug must be lower-case alphanumeric characters with hyphens')
    .optional(),
  description: z.string().trim().max(500).optional().nullable(),
  iconUrl: z.string().url('Invalid icon URL').optional().nullable(),
  parentId: z.string().uuid('Parent ID must be a valid UUID').optional().nullable(),
  displayOrder: z.number().int().min(0).default(0),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .regex(slugRegex, 'Slug must be lower-case alphanumeric characters with hyphens')
      .optional(),
    description: z.string().trim().max(500).optional().nullable(),
    iconUrl: z.string().url().optional().nullable(),
    parentId: z.string().uuid().optional().nullable(),
    isActive: z.boolean().optional(),
    displayOrder: z.number().int().min(0).optional(),
  })
  .strict();

export const categoryIdOrSlugParamSchema = z.object({
  idOrSlug: z.string().min(1, 'Category identifier required'),
});

export const listCategoriesQuerySchema = z.object({
  includeInactive: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  parentId: z
    .string()
    .optional()
    .transform((v) => (v === 'root' ? null : v)),
  tree: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .pipe(z.number().int().min(1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : CATEGORY_PAGINATION.DEFAULT_LIMIT))
    .pipe(z.number().int().min(1).max(CATEGORY_PAGINATION.MAX_LIMIT)),
});
