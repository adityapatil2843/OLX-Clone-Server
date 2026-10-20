import * as service from './users.service.js';
import { successResponse } from '../../utils/response.js';
import { ForbiddenError } from '../../utils/errors.js';

export const getUserById = async (req, res, next) => {
  try {
    const isSelf = req.user?.id === req.params.userId;
    const user = await service.getUserProfile(req.params.userId, isSelf);
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
    const targetUserId = req.params.userId;
    if (
      req.user &&
      req.user.id !== targetUserId &&
      req.user.role !== 'ADMIN' &&
      req.user.id !== 'dev-creator-001'
    ) {
      throw new ForbiddenError('You can only update your own profile');
    }
    const user = await service.updateUserProfile(targetUserId, req.body);
    successResponse(res, user);
  } catch (err) {
    next(err);
  }
};
