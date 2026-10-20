import { successResponse } from '../../utils/response.js';
import * as service from './wishlist.service.js';

export const addToWishlist = async (req, res, next) => {
  try { successResponse(res, await service.addToWishlist(req.user.id, req.params.listingId), 201); } catch (error) { next(error); }
};

export const removeFromWishlist = async (req, res, next) => {
  try { await service.removeFromWishlist(req.user.id, req.params.listingId); successResponse(res, { message: 'Listing removed from wishlist' }); } catch (error) { next(error); }
};

export const listWishlist = async (req, res, next) => {
  try { const result = await service.getWishlist(req.user.id, req.query); successResponse(res, result.data, 200, result.meta); } catch (error) { next(error); }
};
