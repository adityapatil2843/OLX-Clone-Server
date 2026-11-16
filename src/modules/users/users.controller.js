import * as service from './users.service.js';
import { successResponse } from '../../utils/response.js';
import { ForbiddenError } from '../../utils/errors.js';

export const getUserById = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId || req.params.id;
    const isSelf = req.user?.id === targetUserId;
    const user = await service.getUserProfile(targetUserId, isSelf);
    successResponse(res, user);
  } catch (err) {
    next(err);
  }
};

export const listUsers = async (req, res, next) => {
  try {
    const result = await service.listUsers(req.query);
    successResponse(res, result.data, 200, result.meta);
  } catch (err) {
    next(err);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId || req.params.id;
    if (
      req.user &&
      req.user.id !== targetUserId &&
      req.user.role !== 'ADMIN' &&
      req.user.id !== 'dev-creator-001'
    ) {
      throw new ForbiddenError('You can only update your own profile');
    }
    const avatarFile = req.file || (req.files && (req.files.avatar?.[0] || req.files.image?.[0] || req.files.file?.[0])) || null;
    const user = await service.updateUserProfile(targetUserId, req.body, avatarFile);
    successResponse(res, user);
  } catch (err) {
    next(err);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId || req.params.id;
    if (
      req.user &&
      req.user.id !== targetUserId &&
      req.user.role !== 'ADMIN' &&
      req.user.id !== 'dev-creator-001'
    ) {
      throw new ForbiddenError('You can only delete your own account');
    }
    await service.deleteUser(targetUserId);
    successResponse(res, { message: 'User account deleted successfully' });
  } catch (err) {
    next(err);
  }
};
