import { prisma } from '../../db/prisma.js';
import { AD_STATUS } from '../../modules/advertisements/advertisements.constants.js';
import { logger } from '../../config/logger.js';

/**
 * Idempotently marks expired ACTIVE advertisements as COMPLETED.
 * Can be invoked via scheduled worker, cron, or manually on-demand.
 *
 * @param {Date} [referenceDate=new Date()]
 * @param {object} [dbClient=prisma]
 * @returns {Promise<{ expiredCount: number }>}
 */
export const expireAdvertisements = async (referenceDate = new Date(), dbClient = prisma) => {
  const result = await dbClient.advertisement.updateMany({
    where: {
      status: AD_STATUS.ACTIVE,
      endDate: {
        lte: referenceDate,
      },
    },
    data: {
      status: AD_STATUS.COMPLETED,
    },
  });

  if (result.count > 0) {
    logger.info({ expiredCount: result.count }, 'Marked expired advertisements as COMPLETED');
  }

  return { expiredCount: result.count };
};

export default expireAdvertisements;
