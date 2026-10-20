import { Router } from 'express';
import * as controller from './chat.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import {
  conversationIdParamSchema,
  createConversationSchema,
  listConversationsQuerySchema,
  listMessagesQuerySchema,
  sendMessageSchema,
} from './chat.validation.js';

const router = Router();

// All chat routes require authentication
router.use(authenticate);

// ── Conversations ─────────────────────────────────────────────

router
  .route('/')
  .post(validate({ body: createConversationSchema }), controller.getOrCreateConversation)
  .get(validate({ query: listConversationsQuerySchema }), controller.listConversations);

router
  .route('/:conversationId')
  .get(validate({ params: conversationIdParamSchema }), controller.getConversation);

// ── Messages ──────────────────────────────────────────────────

router
  .route('/:conversationId/messages')
  .get(
    validate({ params: conversationIdParamSchema, query: listMessagesQuerySchema }),
    controller.getMessages
  )
  .post(
    validate({ params: conversationIdParamSchema, body: sendMessageSchema }),
    controller.sendMessage
  );

export default router;
