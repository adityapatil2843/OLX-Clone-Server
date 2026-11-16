import { z } from 'zod';
import { AD_STATUS, AD_TARGET_TYPE, AD_PAGINATION } from './advertisements.constants.js';

const uuid = z.string().uuid('Must be a valid UUID');

export const adIdParamSchema = z.object({
  id: uuid,
}).strict();

export const createBoostSchema = z.object({
  targetType: z.enum([AD_TARGET_TYPE.LISTING, AD_TARGET_TYPE.REEL]),
  targetId: uuid,
  packageId: uuid,
  idempotencyKey: z.string().trim().min(1).max(255).optional(),
}).strict();

export const listAdsQuerySchema = z.object({
  status: z.enum(Object.values(AD_STATUS)).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(AD_PAGINATION.MAX_LIMIT).default(AD_PAGINATION.DEFAULT_LIMIT),
}).strict();
