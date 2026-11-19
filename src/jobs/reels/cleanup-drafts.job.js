import { cleanupAbandonedDrafts } from '../../modules/reels/reels.service.js';
import { logger } from '../../config/logger.js';

/**
 * Idempotently purges abandoned DRAFT reels and their associated storage objects.
 * Can be invoked via scheduled worker, cron, or manually on-demand.
 *
 * @param {number} [ttlHours=24]
 * @param {Date} [referenceDate=new Date()]
 * @returns {Promise<{ cleanedCount: number, cleanedReelIds: string[] }>}
 */
export const runDraftCleanupJob = async (ttlHours = 24, referenceDate = new Date()) => {
  logger.info({ ttlHours, referenceDate }, '[Reels Job] Starting abandoned draft cleanup');
  const result = await cleanupAbandonedDrafts(ttlHours, referenceDate);

  if (result.cleanedCount > 0) {
    logger.info(
      { cleanedCount: result.cleanedCount, cleanedReelIds: result.cleanedReelIds },
      '[Reels Job] Cleaned up abandoned draft reels'
    );
  } else {
    logger.info('[Reels Job] No abandoned draft reels found to clean up');
  }

  return result;
};

export default runDraftCleanupJob;
