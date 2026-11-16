import { prisma } from '../../db/prisma.js';
import { getPagination } from '../../utils/pagination.js';

export const getUserCoinsBalance = async (userId, dbClient = prisma) => {
  const user = await dbClient.user.findUnique({
    where: { id: userId },
    select: { coinsBalance: true },
  });
  return user ? user.coinsBalance : null;
};

export const listTransactionsByUserId = async (userId, { page = 1, limit = 20 }) => {
  const { skip, take } = getPagination({ page, limit }, { defaultLimit: 20, maxLimit: 100 });
  const where = { userId };

  const [transactions, total] = await Promise.all([
    prisma.coinTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.coinTransaction.count({ where }),
  ]);

  return { transactions, total };
};

export const createCoinTransaction = async (data, dbClient = prisma) => {
  return dbClient.coinTransaction.create({
    data,
  });
};

export const findTransactionByIdempotencyKey = async (idempotencyKey, dbClient = prisma) => {
  if (!idempotencyKey) return null;
  return dbClient.coinTransaction.findUnique({
    where: { idempotencyKey },
  });
};

/**
 * Atomically decrements the user's coinsBalance only if they have enough balance.
 * Prevents race conditions and negative balances under concurrent requests.
 *
 * @param {string} userId
 * @param {number} cost
 * @param {object} [dbClient]
 * @returns {Promise<number|null>} Returns new balanceAfter, or null if insufficient funds / not found.
 */
export const atomicDebitUserCoins = async (userId, cost, dbClient = prisma) => {
  const result = await dbClient.$queryRawUnsafe(
    `UPDATE "User"
     SET "coinsBalance" = "coinsBalance" - $1
     WHERE id = $2 AND "coinsBalance" >= $1
     RETURNING "coinsBalance"`,
    cost,
    userId
  );

  if (!result || result.length === 0) {
    return null;
  }
  return result[0].coinsBalance;
};
