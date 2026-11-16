import * as repo from './notifications.repository.js';
import { logger } from '../../config/logger.js';
import { NotFoundError } from '../../utils/errors.js';
import { TYPE_TO_PREFERENCE } from './notifications.constants.js';

export const createNotification = async ({ userId, type, title, message, data = null }) => {
  if (!userId) return null;
  return repo.createNotification({ userId, type, title, message, data });
};

export const createNotificationIfEnabled = async ({ userId, actorId, type, title, message, data = null }) => {
  if (!userId || userId === actorId) return null;
  try {
    const preferences = await repo.getPreferences(userId);
    const key = TYPE_TO_PREFERENCE[type];
    if (preferences && key && preferences[key] === false) return null;
    return await createNotification({ userId, type, title, message, data });
  } catch (error) {
    logger.warn({ err: error, type, userId }, 'Notification creation failed');
    return null;
  }
};

export const listUserNotifications = (userId, query) => repo.listNotifications({ userId, ...query });
export const markNotificationAsRead = async (id, userId) => {
  const existing = await repo.findOwnedNotification(id, userId);
  if (!existing) throw new NotFoundError('Notification not found');
  await repo.markRead(id, userId);
  return { ...existing, isRead: true, readAt: new Date() };
};
export const markAllNotificationsAsRead = (userId) => repo.markAllRead(userId);
export const deleteUserNotification = async (id, userId) => {
  const result = await repo.deleteNotification(id, userId);
  if (!result.count) throw new NotFoundError('Notification not found');
};
export const getPreferences = async (userId) => (await repo.getPreferences(userId)) || { userId, newMessage: true, listingUpdates: true, reelActivity: true, moderationUpdates: true };
export const updatePreferences = (userId, data) => repo.upsertPreferences(userId, data);
