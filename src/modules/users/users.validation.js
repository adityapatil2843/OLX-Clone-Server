import { z } from 'zod';
import { USER_PAGINATION } from './users.constants.js';

export const userIdParamSchema = z.object({
  userId: z.string().uuid('User ID must be a valid UUID'),
});

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
    bio: z.string().trim().max(500, 'Bio maximum 500 characters').optional().nullable(),
    avatarUrl: z.string().url('Avatar must be a valid URL').optional().nullable(),
    locationState: z.string().trim().max(100).optional().nullable(),
    locationCity: z.string().trim().max(100).optional().nullable(),
  })
  .strict(); // Rejects restricted fields like role or isVerifiedSeller

export const listUsersQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .pipe(z.number().int().min(1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : USER_PAGINATION.DEFAULT_LIMIT))
    .pipe(z.number().int().min(1).max(USER_PAGINATION.MAX_LIMIT)),
});
