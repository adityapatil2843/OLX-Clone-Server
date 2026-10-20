import * as service from './chat.service.js';
import { successResponse } from '../../utils/response.js';

export const getOrCreateConversation = async (req, res, next) => {
  try {
    const conversation = await service.getOrCreateConversation(req.body, req.user.id);
    successResponse(res, conversation, 201);
  } catch (err) {
    next(err);
  }
};

export const listConversations = async (req, res, next) => {
  try {
    const result = await service.listConversations(req.user.id, req.query);
    successResponse(res, result.data, 200, result.meta);
  } catch (err) {
    next(err);
  }
};

export const getConversation = async (req, res, next) => {
  try {
    const conversation = await service.getConversation(req.params.conversationId, req.user.id);
    successResponse(res, conversation);
  } catch (err) {
    next(err);
  }
};

export const sendMessage = async (req, res, next) => {
  try {
    const message = await service.sendMessage(req.params.conversationId, req.user.id, req.body);
    successResponse(res, message, 201);
  } catch (err) {
    next(err);
  }
};

export const getMessages = async (req, res, next) => {
  try {
    const result = await service.getMessages(req.params.conversationId, req.user.id, req.query);
    successResponse(res, result.data, 200, result.meta);
  } catch (err) {
    next(err);
  }
};
