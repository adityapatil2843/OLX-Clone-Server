import { z } from 'zod';
import { REPORT_STATUS } from './admin.constants.js';

const uuid = z.string().uuid('Must be a valid UUID');

export const idParamSchema = z.object({
  id: uuid,
});

export const moderateListingSchema = z.object({
  status: z.enum(['ACTIVE', 'DRAFT', 'SOLD', 'ARCHIVED']),
  reason: z.string().trim().max(500).optional(),
}).strict();

export const moderateReelSchema = z.object({
  status: z.enum(['PUBLISHED', 'DRAFT', 'PROCESSING', 'FAILED', 'ARCHIVED']),
  reason: z.string().trim().max(500).optional(),
}).strict();

export const moderateUserSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(['USER', 'ADMIN', 'MODERATOR']).optional(),
  reason: z.string().trim().max(500).optional(),
}).strict();

export const createReportSchema = z.object({
  targetType: z.enum(['USER', 'LISTING', 'REEL']),
  targetId: z.string().min(1, 'Target ID is required'),
  reason: z.string().trim().min(3).max(200),
  details: z.string().trim().max(2000).optional().nullable(),
}).strict();

export const resolveReportSchema = z.object({
  status: z.enum([REPORT_STATUS.REVIEWED, REPORT_STATUS.RESOLVED, REPORT_STATUS.DISMISSED]),
  resolutionNotes: z.string().trim().max(1000).optional().nullable(),
}).strict();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
