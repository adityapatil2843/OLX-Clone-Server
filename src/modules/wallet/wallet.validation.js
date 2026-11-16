import { z } from 'zod';
import { WALLET_PAGINATION } from './wallet.constants.js';

export const listTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(WALLET_PAGINATION.MAX_LIMIT).default(WALLET_PAGINATION.DEFAULT_LIMIT),
});
