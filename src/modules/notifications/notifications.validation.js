import { z } from 'zod';

const uuid = z.string().uuid('Must be a valid UUID');

export const notificationIdParamSchema = z.object({ notificationId: uuid });
export const notificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.enum(['true', 'false']).transform((value) => value === 'true').default(false),
});
export const updatePreferencesSchema = z.object({
  newMessage: z.boolean().optional(),
  listingUpdates: z.boolean().optional(),
  reelActivity: z.boolean().optional(),
  moderationUpdates: z.boolean().optional(),
}).strict();
