import { prisma } from '../../db/prisma.js';

export const listActivePackages = async (dbClient = prisma) => {
  return dbClient.boostPackage.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
};

export const findPackageById = async (id, dbClient = prisma) => {
  return dbClient.boostPackage.findUnique({
    where: { id },
  });
};
