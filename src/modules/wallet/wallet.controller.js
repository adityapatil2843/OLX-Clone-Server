import * as service from './wallet.service.js';
import { successResponse } from '../../utils/response.js';

export const getBalance = async (req, res, next) => {
  try {
    const data = await service.getWalletBalance(req.user.id);
    successResponse(res, data);
  } catch (err) {
    next(err);
  }
};

export const getTransactions = async (req, res, next) => {
  try {
    const result = await service.getWalletTransactions(req.user.id, req.query);
    successResponse(res, result.data, 200, result.meta);
  } catch (err) {
    next(err);
  }
};
