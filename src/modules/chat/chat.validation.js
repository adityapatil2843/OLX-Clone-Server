import { z } from 'zod';
import { MESSAGE_TYPE, CHAT_PAGINATION } from './chat.constants.js';

const uuid = z.string().uuid('Must be a valid UUID');

export const conversationIdParamSchema = z.object({
  conversationId: uuid,
});

export const createConversationSchema = z.object({
  recipientId: z.string().min(1, 'Recipient ID is required'),
  listingId: uuid.optional().nullable(),
}).strict();

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message content cannot be empty').max(5000),
  type: z.enum(Object.values(MESSAGE_TYPE)).default(MESSAGE_TYPE.TEXT),
}).strict();

export const listConversationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(CHAT_PAGINATION.MAX_LIMIT).default(CHAT_PAGINATION.DEFAULT_LIMIT),
});

export const listMessagesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(CHAT_PAGINATION.MAX_LIMIT).default(CHAT_PAGINATION.DEFAULT_LIMIT),
});
