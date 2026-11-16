/**
 * One-Time Welcome Bonus Backfill Script
 *
 * Primary Purpose:
 * Gives every eligible existing user a one-time 200-coin welcome bonus and creates
 * an auditable CoinTransaction ledger record.
 *
 * Safe & Idempotent:
 * - Uses stable idempotency key: `existing-user-welcome-bonus-${userId}`.
 * - Row-level lock: `SELECT ... FOR UPDATE` inside per-user transaction.
 * - In-transaction re-verification: `isActive === true`, `deletedAt === null`, and
 *   specific `idempotencyKey` absence. Does NOT blindly trust candidate list.
 * - Atomic balance update via parameterized SQL: `UPDATE ... RETURNING coinsBalance`.
 * - PostgreSQL abort-safe: catches `P2002` outside the per-user transaction, verifies
 *   it is indeed the target `idempotencyKey` conflict before treating as skipped.
 * - Preserves existing coinsBalance by incrementing (never overwriting).
 * - Never credits inactive or soft-deleted users.
 * - Logs no sensitive PII (emails, passwords, tokens).
 * - Supports informational dry-run mode via `--dry-run` flag.
 */

import { prisma } from '../src/db/prisma.js';
import { logger } from '../src/config/logger.js';

export const BACKFILL_BONUS_COINS = 200;
export const BACKFILL_REASON = 'One-time existing user welcome bonus backfill';

/**
 * Builds the canonical idempotency key for the backfill transaction.
 *
 * @param {string} userId
 * @returns {string}
 */
export const getBackfillIdempotencyKey = (userId) =>
  `existing-user-welcome-bonus-${userId}`;

/**
 * Runs the welcome coins backfill logic.
 *
 * @param {object} options
 * @param {boolean} [options.dryRun=false]
 * @param {object} [options.dbClient=prisma]
 * @param {object} [options.log=logger]
 * @returns {Promise<object>} Summary of the backfill execution
 */
export async function runWelcomeCoinsBackfill({
  dryRun = false,
  dbClient = prisma,
  log = logger,
} = {}) {
  log.info({ dryRun }, '[Backfill] Starting welcome bonus coin backfill job...');

  // 1. Audit counts for inactive and soft-deleted accounts
  const inactiveOrDeletedCount = await dbClient.user.count({
    where: {
      OR: [{ isActive: false }, { deletedAt: { not: null } }],
    },
  });

  // 2. Query all existing active and non-deleted candidate users who do NOT have our backfill transaction
  const candidateUsers = await dbClient.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      coinTransactions: {
        none: {
          idempotencyKey: {
            startsWith: 'existing-user-welcome-bonus-',
          },
        },
      },
    },
    select: {
      id: true,
      coinsBalance: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  // 3. Query count of users who already received our backfill welcome bonus
  const alreadyCreditedCount = await dbClient.coinTransaction.count({
    where: {
      idempotencyKey: {
        startsWith: 'existing-user-welcome-bonus-',
      },
    },
  });

  const summary = {
    dryRun,
    bonusAmount: BACKFILL_BONUS_COINS,
    totalCandidatesFound: candidateUsers.length,
    alreadyCreditedCount,
    skippedInactiveOrDeletedCount: inactiveOrDeletedCount,
    creditedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    failures: [],
    disclaimer: dryRun
      ? 'Informational estimate based on current database state; actual execution counts may vary if database records change prior to live run.'
      : undefined,
  };

  if (dryRun) {
    log.info(
      {
        totalCandidates: candidateUsers.length,
        alreadyCredited: alreadyCreditedCount,
        skippedInactiveOrDeleted: inactiveOrDeletedCount,
        disclaimer: summary.disclaimer,
      },
      '[Backfill DRY-RUN] Dry run completed. No data was modified.'
    );
    return summary;
  }

  // 4. Process each candidate user within an isolated transactional boundary
  for (const candidate of candidateUsers) {
    const targetIdempotencyKey = getBackfillIdempotencyKey(candidate.id);

    try {
      const outcome = await dbClient.$transaction(async (tx) => {
        // Condition 1: Acquire row-level lock and re-verify authoritative user state
        const lockedRows = await tx.$queryRaw`
          SELECT id, "coinsBalance", "isActive", "deletedAt"
          FROM "User"
          WHERE id = ${candidate.id}
          FOR UPDATE
        `;

        if (!lockedRows || lockedRows.length === 0) {
          return { status: 'skipped', reason: 'User not found during row lock' };
        }

        const lockedUser = lockedRows[0];

        // Re-verify in-transaction: must be active and not deleted
        if (!lockedUser.isActive || lockedUser.deletedAt !== null) {
          return {
            status: 'skipped',
            reason: 'User is inactive or deleted during lock verification',
          };
        }

        // Re-verify in-transaction: specific idempotencyKey must be absent
        const existingTx = await tx.coinTransaction.findUnique({
          where: { idempotencyKey: targetIdempotencyKey },
          select: { id: true },
        });

        if (existingTx) {
          return { status: 'skipped', reason: 'Already credited' };
        }

        // Atomic balance increment via parameterized SQL
        const updateResult = await tx.$queryRaw`
          UPDATE "User"
          SET "coinsBalance" = "coinsBalance" + ${BACKFILL_BONUS_COINS}
          WHERE id = ${candidate.id}
          RETURNING "coinsBalance"
        `;

        const newBalance = updateResult[0]?.coinsBalance;

        // Insert auditable ledger transaction
        await tx.coinTransaction.create({
          data: {
            userId: candidate.id,
            amount: BACKFILL_BONUS_COINS,
            balanceAfter: newBalance,
            type: 'WELCOME_BONUS',
            reason: BACKFILL_REASON,
            idempotencyKey: targetIdempotencyKey,
          },
        });

        return {
          status: 'credited',
          newBalance,
        };
      });

      if (outcome.status === 'credited') {
        summary.creditedCount += 1;
      } else {
        summary.skippedCount += 1;
      }
    } catch (err) {
      // Condition 2: P2002 verification - do NOT blindly skip
      const isUniqueConflict = err?.code === 'P2002';
      const targetField = err?.meta?.target;
      const isTargetKeyConflict =
        isUniqueConflict &&
        (Array.isArray(targetField)
          ? targetField.includes('idempotencyKey')
          : typeof targetField === 'string' && targetField.includes('idempotencyKey'));

      if (isTargetKeyConflict) {
        // Confirm if the conflicting record is indeed our target backfill idempotency key
        const conflictRecord = await dbClient.coinTransaction.findUnique({
          where: { idempotencyKey: targetIdempotencyKey },
          select: { id: true },
        });

        if (conflictRecord) {
          summary.skippedCount += 1;
          log.info(
            { userId: candidate.id },
            '[Backfill] Skipped user due to confirmed target idempotencyKey collision'
          );
          continue;
        }
      }

      // Any other error or unrelated unique constraint is treated as genuine failure
      summary.failedCount += 1;
      summary.failures.push({
        userId: candidate.id,
        error: err.message,
        code: err.code || null,
      });
      log.error(
        { userId: candidate.id, err: err.message, code: err.code },
        '[Backfill] Failed to credit welcome bonus for user'
      );
    }
  }

  log.info(
    {
      dryRun: summary.dryRun,
      totalCandidates: summary.totalCandidatesFound,
      credited: summary.creditedCount,
      skipped: summary.skippedCount,
      failed: summary.failedCount,
    },
    '[Backfill] Welcome bonus backfill completed successfully.'
  );

  return summary;
}

// Direct execution entrypoint
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('backfill-welcome-coins.js') ||
    process.argv[1].includes('backfill-welcome-coins'));

if (isDirectRun) {
  const isDryRun =
    process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';

  runWelcomeCoinsBackfill({ dryRun: isDryRun })
    .then((result) => {
      console.log('\n================ BACKFILL SUMMARY ================');
      console.log(`Mode:                          ${result.dryRun ? 'DRY-RUN (Simulated)' : 'LIVE EXECUTION'}`);
      console.log(`Candidates Found:              ${result.totalCandidatesFound}`);
      console.log(`Already Credited Users:        ${result.alreadyCreditedCount}`);
      console.log(`Skipped (Inactive/Deleted):    ${result.skippedInactiveOrDeletedCount}`);
      console.log(`Successfully Credited:         ${result.creditedCount}`);
      console.log(`Skipped (In-Tx Verified):      ${result.skippedCount}`);
      console.log(`Failed:                        ${result.failedCount}`);
      if (result.disclaimer) {
        console.log(`Note:                          ${result.disclaimer}`);
      }
      if (result.failures.length > 0) {
        console.log('Failures:', result.failures);
      }
      console.log('==================================================\n');
      process.exit(result.failedCount > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('Fatal error during backfill execution:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
