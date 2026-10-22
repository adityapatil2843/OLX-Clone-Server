import { z } from 'zod';
import { LISTING_MEDIA_TYPE, LISTING_PAGINATION, LISTING_STATUS } from './listings.constants.js';

const uuid = z.string().uuid('Must be a valid UUID');
const phone = z.string().trim().regex(/^\+?[1-9]\d{6,14}$/, 'Must be a valid phone number');
const optionalText = (max) => z.string().trim().max(max).optional().nullable();

export const listingIdParamSchema = z.object({ listingId: uuid });

export const createListingSchema = z.object({
  title: z.string().trim().min(2).max(160),
  price: z.coerce.number().positive().max(99_999_999),
  currency: z.string().trim().toUpperCase().length(3).default('INR'),
  description: optionalText(5_000),
  categoryId: uuid,
  locationState: optionalText(100),
  locationCity: optionalText(100),
  locationLocality: optionalText(150),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  attributes: z.preprocess((val) => {
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return val; }
    }
    return val;
  }, z.record(z.any()).optional().nullable()),
  contactPhone: phone,
  status: z.enum([LISTING_STATUS.DRAFT, LISTING_STATUS.ACTIVE]).default(LISTING_STATUS.ACTIVE),
  imageUrl: z.string().optional().nullable(),
  imageUrls: z.preprocess((val) => {
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [val];
      }
    }
    return val;
  }, z.array(z.string()).optional().nullable()),
}).passthrough();

export const updateListingSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  price: z.coerce.number().positive().max(99_999_999).optional(),
  currency: z.string().trim().toUpperCase().length(3).optional(),
  description: optionalText(5_000),
  categoryId: uuid.optional(),
  locationState: optionalText(100),
  locationCity: optionalText(100),
  locationLocality: optionalText(150),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  attributes: z.record(z.any()).optional().nullable(),
  contactPhone: phone.optional(),
  status: z.enum([LISTING_STATUS.DRAFT, LISTING_STATUS.ACTIVE, LISTING_STATUS.SOLD, LISTING_STATUS.ARCHIVED]).optional(),
}).strict();

export const publicListingsQuerySchema = z.object({
  categoryId: uuid.optional(),
  state: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().positive().max(1000).optional(),
  search: z.string().trim().max(100).optional(),
  sortBy: z.enum(['newest', 'price_asc', 'price_desc', 'distance']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LISTING_PAGINATION.MAX_LIMIT).default(LISTING_PAGINATION.DEFAULT_LIMIT),
}).refine((data) => data.maxPrice === undefined || data.minPrice === undefined || data.maxPrice >= data.minPrice, {
  message: 'maxPrice must be greater than or equal to minPrice',
  path: ['maxPrice'],
}).refine((data) => {
  // If latitude is provided, longitude must be provided, and vice versa
  if ((data.latitude !== undefined && data.longitude === undefined) || (data.longitude !== undefined && data.latitude === undefined)) {
    return false;
  }
  return true;
}, {
  message: 'Both latitude and longitude must be provided together',
  path: ['latitude'],
});

export const myListingsQuerySchema = z.object({
  status: z.enum(Object.values(LISTING_STATUS)).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LISTING_PAGINATION.MAX_LIMIT).default(LISTING_PAGINATION.DEFAULT_LIMIT),
});

export const uploadSignatureSchema = z.object({
  type: z.enum([LISTING_MEDIA_TYPE.IMAGE, LISTING_MEDIA_TYPE.VIDEO]),
  fileName: z.string().trim().min(1).max(255),
  fileType: z.string().trim().min(1).max(100),
  fileSizeBytes: z.coerce.number().int().positive().max(500 * 1024 * 1024),
}).superRefine((data, ctx) => {
  const allowed = data.type === LISTING_MEDIA_TYPE.IMAGE
    ? ['image/jpeg', 'image/png', 'image/webp']
    : ['video/mp4', 'video/quicktime', 'video/webm'];
  if (!allowed.includes(data.fileType)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fileType'], message: `Unsupported ${data.type.toLowerCase()} type` });
  }
});

export const attachMediaSchema = z.object({
  type: z.enum([LISTING_MEDIA_TYPE.IMAGE, LISTING_MEDIA_TYPE.VIDEO]),
  storageKey: z.string().trim().min(1).max(500),
  provider: z.literal('cloudinary').default('cloudinary'),
  thumbnailKey: z.string().trim().min(1).max(500).optional().nullable(),
  displayOrder: z.coerce.number().int().min(0).max(100).default(0),
}).strict();

export const updateListingStatusSchema = z.object({
  status: z.enum([LISTING_STATUS.DRAFT, LISTING_STATUS.ACTIVE, LISTING_STATUS.SOLD, LISTING_STATUS.ARCHIVED]),
}).strict();
