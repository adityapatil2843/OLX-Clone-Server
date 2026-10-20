import { successResponse } from '../../utils/response.js';
import * as service from './listings.service.js';

export const createListing = async (req, res, next) => {
  try { successResponse(res, await service.createListing(req.body, req.user.id), 201); } catch (error) { next(error); }
};

export const listMyListings = async (req, res, next) => {
  try { const result = await service.getMyListings(req.user.id, req.query); successResponse(res, result.data, 200, result.meta); } catch (error) { next(error); }
};

export const updateListing = async (req, res, next) => {
  try { successResponse(res, await service.updateListing(req.params.listingId, req.body, req.user.id)); } catch (error) { next(error); }
};

export const deleteListing = async (req, res, next) => {
  try { await service.deleteListing(req.params.listingId, req.user.id); successResponse(res, { message: 'Listing archived successfully' }); } catch (error) { next(error); }
};

export const listPublicListings = async (req, res, next) => {
  try { const result = await service.getPublicListings(req.query, req.user?.id); successResponse(res, result.data, 200, result.meta); } catch (error) { next(error); }
};

export const getPublicListing = async (req, res, next) => {
  try { successResponse(res, await service.getPublicListing(req.params.listingId, req.user?.id)); } catch (error) { next(error); }
};

export const requestMediaUpload = async (req, res, next) => {
  try { successResponse(res, await service.requestMediaUpload(req.params.listingId, req.user.id, req.body)); } catch (error) { next(error); }
};

export const attachMedia = async (req, res, next) => {
  try { successResponse(res, await service.attachMedia(req.params.listingId, req.user.id, req.body), 201); } catch (error) { next(error); }
};
