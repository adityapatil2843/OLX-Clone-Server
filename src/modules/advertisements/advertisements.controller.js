import * as service from './advertisements.service.js';
import { successResponse } from '../../utils/response.js';

export const createAdvertisement = async (req, res, next) => {
  try {
    const ad = await service.createAdvertisement(req.body, req.user.id);
    successResponse(res, ad, 201);
  } catch (err) {
    next(err);
  }
};

export const getAdvertisement = async (req, res, next) => {
  try {
    const ad = await service.getAdvertisement(req.params.id, req.user.id, req.user.role);
    successResponse(res, ad);
  } catch (err) {
    next(err);
  }
};

export const listMyAdvertisements = async (req, res, next) => {
  try {
    const result = await service.listMyAdvertisements(req.user.id, req.query);
    successResponse(res, result.data, 200, result.meta);
  } catch (err) {
    next(err);
  }
};

export const stopAdvertisement = async (req, res, next) => {
  try {
    const ad = await service.stopAdvertisement(req.params.id, req.user.id, req.user.role);
    successResponse(res, ad);
  } catch (err) {
    next(err);
  }
};
