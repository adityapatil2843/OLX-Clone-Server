import * as repo from './chat.repository.js';
import { prisma } from '../../db/prisma.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../utils/errors.js';
import { uploadBufferToCloudinary } from '../../integrations/storage/cloudinary.service.js';

export const getOrCreateConversation = async ({ recipientId, listingId = null }, userId) => {
  if (recipientId === userId) {
    throw new BadRequestError('You cannot start a conversation with yourself');
  }

  // Ensure recipient exists
  const recipient = await prisma.user.findUnique({
    where: { id: recipientId },
  });

  if (!recipient || !recipient.isActive) {
    throw new NotFoundError('Recipient user not found or inactive');
  }

  // If listingId is provided, verify it exists
  if (listingId) {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
    });

    if (!listing || listing.deletedAt) {
      throw new NotFoundError('Listing not found');
    }
  }

  // Check if conversation already exists between these users (for this listing)
  const existing = await repo.findConversationBetweenUsers({
    userId1: userId,
    userId2: recipientId,
    listingId,
  });

  if (existing) {
    return existing;
  }

  // Create new conversation
  return repo.createConversation({
    listingId,
    participantIds: [userId, recipientId],
  });
};

export const listConversations = async (userId, query) => {
  const page = Math.max(1, parseInt(query?.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(query?.limit, 10) || 20));
  const result = await repo.listConversationsForUser({ userId, page, limit });

  return {
    data: result.conversations,
    meta: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
      hasNextPage: page * limit < result.total,
    },
  };
};

export const getConversation = async (conversationId, userId) => {
  const conversation = await repo.findConversationById(conversationId);
  if (!conversation) {
    throw new NotFoundError(`Conversation '${conversationId}' not found`);
  }

  const isParticipant = await repo.isUserParticipant(conversationId, userId);
  if (!isParticipant) {
    throw new ForbiddenError('You are not a participant in this conversation');
  }

  return conversation;
};

export const sendMessage = async (conversationId, userId, payload) => {
  const conversation = await repo.findConversationById(conversationId);
  if (!conversation) {
    throw new NotFoundError(`Conversation '${conversationId}' not found`);
  }

  const isParticipant = await repo.isUserParticipant(conversationId, userId);
  if (!isParticipant) {
    throw new ForbiddenError('You are not a participant in this conversation');
  }

  return repo.createMessage({
    conversationId,
    senderId: userId,
    content: payload.content,
    type: payload.type,
  });
};

export const uploadImage = async (conversationId, userId, file) => {
  if (!file) throw new BadRequestError('Image file is required');
  if (!file.mimetype?.startsWith('image/')) {
    throw new BadRequestError('Only image files are allowed');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new BadRequestError('Image must be 10 MB or smaller');
  }

  const conversation = await repo.findConversationById(conversationId);
  if (!conversation) throw new NotFoundError(`Conversation '${conversationId}' not found`);
  if (!(await repo.isUserParticipant(conversationId, userId))) {
    throw new ForbiddenError('You are not a participant in this conversation');
  }

  const uploaded = await uploadBufferToCloudinary(file.buffer, {
    folder: `chat/${conversationId}`,
    resource_type: 'image',
  });

  return {
    url: uploaded.secure_url || uploaded.url,
    mimeType: file.mimetype,
    size: file.size,
  };
};

export const getMessages = async (conversationId, userId, query) => {
  const conversation = await repo.findConversationById(conversationId);
  if (!conversation) {
    throw new NotFoundError(`Conversation '${conversationId}' not found`);
  }

  const isParticipant = await repo.isUserParticipant(conversationId, userId);
  if (!isParticipant) {
    throw new ForbiddenError('You are not a participant in this conversation');
  }

  // Automatically mark messages as read for this participant
  await repo.markMessagesAsRead(conversationId, userId);

  const { cursor, limit = 30 } = query;
  const result = await repo.listMessages({ conversationId, cursor, limit });

  return {
    data: result.messages,
    meta: {
      cursor: cursor || null,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      limit,
    },
  };
};
