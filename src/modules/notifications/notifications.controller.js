import * as service from './notifications.service.js';
import { successResponse } from '../../utils/response.js';

export const list = async (req, res) => {
  const result = await service.listUserNotifications(req.user.id, req.query);
  return successResponse(res, result.notifications, 200, { page: req.query.page, limit: req.query.limit, total: result.total, unreadCount: result.unreadCount, totalPages: Math.ceil(result.total / req.query.limit) });
};
export const markRead = async (req, res) => successResponse(res, await service.markNotificationAsRead(req.params.notificationId, req.user.id));
export const markAllRead = async (req, res) => successResponse(res, { updated: (await service.markAllNotificationsAsRead(req.user.id)).count });
export const remove = async (req, res) => { await service.deleteUserNotification(req.params.notificationId, req.user.id); return successResponse(res, { deleted: true }); };
export const getPreferences = async (req, res) => successResponse(res, await service.getPreferences(req.user.id));
export const updatePreferences = async (req, res) => successResponse(res, await service.updatePreferences(req.user.id, req.body));
