import * as service from './categories.service.js';
import { successResponse } from '../../utils/response.js';

export const listCategories = async (req, res, next) => {
  try {
    const result = await service.listCategories(req.query);
    successResponse(res, result.data, 200, result.meta);
  } catch (err) {
    next(err);
  }
};

export const getCategory = async (req, res, next) => {
  try {
    const category = await service.getCategoryByIdOrSlug(req.params.idOrSlug);
    successResponse(res, category);
  } catch (err) {
    next(err);
  }
};

export const createCategory = async (req, res, next) => {
  try {
    const category = await service.createCategory(req.body);
    successResponse(res, category, 201);
  } catch (err) {
    next(err);
  }
};

export const updateCategory = async (req, res, next) => {
  try {
    const category = await service.updateCategory(req.params.id, req.body);
    successResponse(res, category);
  } catch (err) {
    next(err);
  }
};

export const deactivateCategory = async (req, res, next) => {
  try {
    await service.deactivateCategory(req.params.id);
    successResponse(res, { message: 'Category deactivated successfully' });
  } catch (err) {
    next(err);
  }
};
