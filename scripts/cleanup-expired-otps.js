/**
 * Cleanup Maintenance Script
 * Deletes expired email OTP records from the database.
 * Run with: npm run script:cleanup-otp
 */
import { prisma } from '../src/db/prisma.js';
import { logger } from '../src/config/logger.js';

async function main() {
  logger.info('[Script] Starting expired OTP cleanup...');
  const now = new Date();

  const deleted = await prisma.emailOtp.deleteMany({
    where: {
      expiresAt: {
        lt: now,
      },
    },
  });

  logger.info(`[Script] Successfully cleaned up ${deleted.count} expired OTP record(s).`);
}

main()
  .catch((err) => {
    logger.error({ err }, '[Script] Error running cleanup script');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

