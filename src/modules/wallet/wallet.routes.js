import { Router } from 'express';
import * as controller from './wallet.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { listTransactionsQuerySchema } from './wallet.validation.js';

const router = Router();

router.use(authenticate);

router.get('/balance', controller.getBalance);
router.get('/', controller.getBalance);
router.get('/transactions', validate({ query: listTransactionsQuerySchema }), controller.getTransactions);

export default router;
