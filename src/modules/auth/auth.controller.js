import * as service from './auth.service.js';
import { successResponse } from '../../utils/response.js';

export const register = async (req, res, next) => {
  try {
    const result = await service.register(req.body);
    successResponse(res, result, 201);
  } catch (err) {
    next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const result = await service.login(req.body);
    successResponse(res, result, 200);
  } catch (err) {
    next(err);
  }
};

export const refresh = async (req, res, next) => {
  try {
    const token = req.body.refreshToken || req.headers['x-refresh-token'];
    const result = await service.refreshTokens(token);
    successResponse(res, result, 200);
  } catch (err) {
    next(err);
  }
};

export const logout = async (req, res, next) => {
  try {
    const token = req.body.refreshToken || req.headers['x-refresh-token'];
    const userId = req.user?.id;
    const result = await service.logout(token, userId);
    successResponse(res, result, 200);
  } catch (err) {
    next(err);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const user = await service.getCurrentUser(req.user.id);
    successResponse(res, user, 200);
  } catch (err) {
    next(err);
  }
};
