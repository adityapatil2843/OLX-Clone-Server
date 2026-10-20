import { z } from 'zod';

export const listingIdParamSchema = z.object({
  listingId: z.string().uuid('Listing ID must be a valid UUID'),
});

export const wishlistQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
