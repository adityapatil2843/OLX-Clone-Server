import { prisma } from '../../db/prisma.js';

const conversationInclude = {
  listing: {
    select: {
      id: true,
      title: true,
      price: true,
      currency: true,
      status: true,
    },
  },
  participants: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          isVerifiedSeller: true,
        },
      },
    },
  },
};

export const findConversationBetweenUsers = async ({ userId1, userId2, listingId = null }) => {
  const conversations = await prisma.conversation.findMany({
    where: {
      listingId: listingId || undefined,
      AND: [
        { participants: { some: { userId: userId1 } } },
        { participants: { some: { userId: userId2 } } },
      ],
    },
    include: conversationInclude,
    take: 1,
  });

  return conversations[0] || null;
};

export const createConversation = async ({ listingId, participantIds }) => {
  return prisma.conversation.create({
    data: {
      listingId: listingId || null,
      participants: {
        create: participantIds.map((userId) => ({
          userId,
        })),
      },
    },
    include: conversationInclude,
  });
};

export const findConversationById = async (conversationId) => {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    include: conversationInclude,
  });
};

export const isUserParticipant = async (conversationId, userId) => {
  const participant = await prisma.conversationParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
  });
  return !!participant;
};

export const listConversationsForUser = async ({ userId, page = 1, limit = 20 }) => {
  const where = {
    participants: {
      some: { userId },
    },
  };

  const [conversations, total] = await prisma.$transaction([
    prisma.conversation.findMany({
      where,
      include: conversationInclude,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.conversation.count({ where }),
  ]);

  return { conversations, total };
};

export const createMessage = async ({ conversationId, senderId, content, type }) => {
  const now = new Date();

  // Create message and update conversation's last message atomically
  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        senderId,
        content,
        type,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageText: content,
        lastMessageAt: now,
        updatedAt: now,
      },
    }),
    prisma.conversationParticipant.updateMany({
      where: {
        conversationId,
        userId: { not: senderId },
      },
      data: {
        unreadCount: { increment: 1 },
      },
    }),
  ]);

  return message;
};

export const listMessages = async ({ conversationId, cursor, limit = 30 }) => {
  const where = {
    conversationId,
    deletedAt: null,
  };

  if (cursor) {
    const messages = await prisma.message.findMany({
      where,
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      cursor: { id: cursor },
      skip: 1,
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      messages: items,
      hasMore,
      nextCursor,
    };
  }

  const messages = await prisma.message.findMany({
    where,
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });

  const hasMore = messages.length > limit;
  const items = hasMore ? messages.slice(0, limit) : messages;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return {
    messages: items,
    hasMore,
    nextCursor,
  };
};

export const markMessagesAsRead = async (conversationId, userId) => {
  await prisma.$transaction([
    prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    }),
    prisma.conversationParticipant.updateMany({
      where: {
        conversationId,
        userId,
      },
      data: {
        unreadCount: 0,
        lastReadAt: new Date(),
      },
    }),
  ]);
};
