import * as repo from './wallet.repository.js';
import { NotFoundError } from '../../utils/errors.js';

export const getWalletBalance = async (userId) => {
  const balance = await repo.getUserCoinsBalance(userId);
  if (balance === null) {
    throw new NotFoundError('User not found');
  }
  return { coinsBalance: balance };
};

export const getWalletTransactions = async (userId, query) => {
  const { page = 1, limit = 20 } = query;
  const result = await repo.listTransactionsByUserId(userId, { page, limit });

  return {
    data: result.transactions,
    meta: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
      hasNextPage: page * limit < result.total,
    },
  };
};
