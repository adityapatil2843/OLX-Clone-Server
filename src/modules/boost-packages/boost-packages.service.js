import * as repo from './boost-packages.repository.js';
import { NotFoundError, BadRequestError } from '../../utils/errors.js';
import { BOOST_PACKAGE_MESSAGES } from './boost-packages.constants.js';

export const listActivePackages = async () => {
  return repo.listActivePackages();
};

export const getPackageById = async (id) => {
  const pkg = await repo.findPackageById(id);
  if (!pkg) {
    throw new NotFoundError(BOOST_PACKAGE_MESSAGES.PACKAGE_NOT_FOUND);
  }
  return pkg;
};

export const validateActivePackage = async (id, dbClient) => {
  const pkg = await repo.findPackageById(id, dbClient);
  if (!pkg) {
    throw new NotFoundError(BOOST_PACKAGE_MESSAGES.PACKAGE_NOT_FOUND);
  }
  if (!pkg.isActive) {
    throw new BadRequestError(BOOST_PACKAGE_MESSAGES.PACKAGE_INACTIVE);
  }
  return pkg;
};
