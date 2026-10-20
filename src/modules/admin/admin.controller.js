import * as service from './admin.service.js';
import { successResponse } from '../../utils/response.js';

export const getMetrics = async (_req, res, next) => {
  try {
    const metrics = await service.getMetrics();
    successResponse(res, metrics);
  } catch (err) {
    next(err);
  }
};

export const moderateListing = async (req, res, next) => {
  try {
    const updated = await service.moderateListing(req.params.id, req.body, req.user.id);
    successResponse(res, updated);
  } catch (err) {
    next(err);
  }
};

export const moderateReel = async (req, res, next) => {
  try {
    const updated = await service.moderateReel(req.params.id, req.body, req.user.id);
    successResponse(res, updated);
  } catch (err) {
    next(err);
  }
};

export const moderateUser = async (req, res, next) => {
  try {
    const updated = await service.moderateUser(req.params.id, req.body, req.user.id);
    successResponse(res, updated);
  } catch (err) {
    next(err);
  }
};

export const fileReport = async (req, res, next) => {
  try {
    const report = await service.fileReport(req.body, req.user.id);
    successResponse(res, report, 201);
  } catch (err) {
    next(err);
  }
};

export const listReports = async (req, res, next) => {
  try {
    const result = await service.listReports(req.query);
    successResponse(res, result.data, 200, result.meta);
  } catch (err) {
    next(err);
  }
};

export const resolveReport = async (req, res, next) => {
  try {
    const report = await service.resolveReport(req.params.id, req.body, req.user.id);
    successResponse(res, report);
  } catch (err) {
    next(err);
  }
};

export const listAuditLogs = async (req, res, next) => {
  try {
    const result = await service.listAuditLogs(req.query);
    successResponse(res, result.data, 200, result.meta);
  } catch (err) {
    next(err);
  }
};
