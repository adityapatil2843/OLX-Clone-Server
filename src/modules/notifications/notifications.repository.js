import { prisma } from '../../db/prisma.js';

export const createNotification = (data) => prisma.notification.create({ data });

export const listNotifications = async ({ userId, page, limit, unreadOnly }) => {
  const where = { userId, ...(unreadOnly ? { isRead: false } : {}) };
  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);
  return { notifications, total, unreadCount };
};

export const findOwnedNotification = (id, userId) => prisma.notification.findFirst({ where: { id, userId } });
export const markRead = (id, userId) => prisma.notification.updateMany({ where: { id, userId, isRead: false }, data: { isRead: true, readAt: new Date() } });
export const markAllRead = (userId) => prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true, readAt: new Date() } });
export const deleteNotification = (id, userId) => prisma.notification.deleteMany({ where: { id, userId } });
export const getPreferences = (userId) => prisma.notificationPreference.findUnique({ where: { userId } });
export const upsertPreferences = (userId, data) => prisma.notificationPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data });
