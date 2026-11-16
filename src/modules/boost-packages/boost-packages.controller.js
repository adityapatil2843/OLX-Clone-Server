import * as service from './boost-packages.service.js';
import { successResponse } from '../../utils/response.js';

export const listPackages = async (req, res, next) => {
  try {
    const packages = await service.listActivePackages();
    successResponse(res, packages);
  } catch (err) {
    next(err);
  }
};

export const getPackage = async (req, res, next) => {
  try {
    const pkg = await service.getPackageById(req.params.id);
    successResponse(res, pkg);
  } catch (err) {
    next(err);
  }
};
