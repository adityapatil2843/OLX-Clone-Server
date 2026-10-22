import { successResponse } from '../../utils/response.js';
import * as service from './listings.service.js';

export const createListing = async (req, res, next) => {
  try {
    let files = [];
    if (req.file) {
      files = [req.file];
    } else if (req.files) {
      if (Array.isArray(req.files)) {
        files = req.files;
      } else {
        files = [
          ...(req.files.file || []),
          ...(req.files.image || []),
          ...(req.files.images || []),
        ];
      }
    }

    const created = await service.createListing(req.body, req.user.id, files);
    successResponse(res, created, 201);
  } catch (error) {
    next(error);
  }
};

export const listMyListings = async (req, res, next) => {
  try {
    const result = await service.getMyListings(req.user.id, req.query);
    successResponse(res, result.data, 200, result.meta);
  } catch (error) {
    next(error);
  }
};

export const updateListing = async (req, res, next) => {
  try {
    successResponse(res, await service.updateListing(req.params.listingId, req.body, req.user.id, req.user.role));
  } catch (error) {
    next(error);
  }
};

export const updateListingStatus = async (req, res, next) => {
  try {
    const updated = await service.updateListingStatus(req.params.listingId, req.body.status, req.user.id, req.user.role);
    successResponse(res, updated);
  } catch (error) {
    next(error);
  }
};

export const deleteListing = async (req, res, next) => {
  try {
    await service.deleteListing(req.params.listingId, req.user.id, req.user.role);
    successResponse(res, { message: 'Listing archived successfully' });
  } catch (error) {
    next(error);
  }
};

export const listPublicListings = async (req, res, next) => {
  try {
    const result = await service.getPublicListings(req.query, req.user?.id);
    successResponse(res, result.data, 200, result.meta);
  } catch (error) {
    next(error);
  }
};

export const getPublicListing = async (req, res, next) => {
  try {
    successResponse(res, await service.getPublicListing(req.params.listingId, req.user?.id));
  } catch (error) {
    next(error);
  }
};

export const requestMediaUpload = async (req, res, next) => {
  try {
    successResponse(res, await service.requestMediaUpload(req.params.listingId, req.user.id, req.body));
  } catch (error) {
    next(error);
  }
};

export const attachMedia = async (req, res, next) => {
  try {
    successResponse(res, await service.attachMedia(req.params.listingId, req.user.id, req.body), 201);
  } catch (error) {
    next(error);
  }
};

export const uploadMediaDirect = async (req, res, next) => {
  try {
    const file = req.file || req.files?.file?.[0] || req.files?.image?.[0];
    const result = await service.uploadMediaDirect(
      req.params.listingId,
      req.user.id,
      file,
      req.body
    );
    successResponse(res, result, 201);
  } catch (error) {
    next(error);
  }
};

