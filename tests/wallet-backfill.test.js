import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db/prisma.js';
import {
  runWelcomeCoinsBackfill,
  BACKFILL_BONUS_COINS,
  BACKFILL_REASON,
  getBackfillIdempotencyKey,
} from '../scripts/backfill-welcome-coins.js';

test('Wallet Backfill — First-time credit, positive balance, zero balance & ledger correctness', async () => {
  const suffix = `bf-first-${Date.now()}`;
  let userZero, userPositive;

  try {
    // 1. Setup users: one with 0 coins, one with 75 coins
    userZero = await prisma.user.create({
      data: {
        name: 'Zero Balance User',
        email: `zero-${suffix}@example.com`,
        passwordHash: 'hash',
        coinsBalance: 0,
        isActive: true,
      },
    });

    userPositive = await prisma.user.create({
      data: {
        name: 'Positive Balance User',
        email: `pos-${suffix}@example.com`,
        passwordHash: 'hash',
        coinsBalance: 75,
        isActive: true,
      },
    });

    // 2. Run backfill
    const summary = await runWelcomeCoinsBackfill({ dryRun: false });
    assert.ok(summary.creditedCount >= 2, 'Must have credited at least our 2 newly created users');

    // 3. Verify zero-balance user
    const updatedZero = await prisma.user.findUnique({ where: { id: userZero.id } });
    assert.equal(updatedZero.coinsBalance, 200, 'Zero balance user must now have exactly 200 coins');

    const txZero = await prisma.coinTransaction.findUnique({
      where: { idempotencyKey: getBackfillIdempotencyKey(userZero.id) },
    });
    assert.ok(txZero, 'Must have CoinTransaction record');
    assert.equal(txZero.amount, 200);
    assert.equal(txZero.balanceAfter, 200);
    assert.equal(txZero.type, 'WELCOME_BONUS');
    assert.equal(txZero.reason, BACKFILL_REASON);

    // 4. Verify positive-balance user
    const updatedPos = await prisma.user.findUnique({ where: { id: userPositive.id } });
    assert.equal(updatedPos.coinsBalance, 275, 'Positive balance user must now have 75 + 200 = 275 coins');

    const txPos = await prisma.coinTransaction.findUnique({
      where: { idempotencyKey: getBackfillIdempotencyKey(userPositive.id) },
    });
    assert.ok(txPos, 'Must have CoinTransaction record');
    assert.equal(txPos.amount, 200);
    assert.equal(txPos.balanceAfter, 275);
    assert.equal(txPos.type, 'WELCOME_BONUS');
  } finally {
    if (userZero) {
      await prisma.coinTransaction.deleteMany({ where: { userId: userZero.id } });
      await prisma.user.deleteMany({ where: { id: userZero.id } });
    }
    if (userPositive) {
      await prisma.coinTransaction.deleteMany({ where: { userId: userPositive.id } });
      await prisma.user.deleteMany({ where: { id: userPositive.id } });
    }
  }
});

test('Wallet Backfill — Idempotency on rerun (cannot credit user twice)', async () => {
  const suffix = `bf-rerun-${Date.now()}`;
  let user;

  try {
    user = await prisma.user.create({
      data: {
        name: 'Rerun User',
        email: `rerun-${suffix}@example.com`,
        passwordHash: 'hash',
        coinsBalance: 50,
        isActive: true,
      },
    });

    // Run 1: credits user
    const summary1 = await runWelcomeCoinsBackfill({ dryRun: false });
    assert.ok(summary1.creditedCount >= 1);

    const userAfterRun1 = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(userAfterRun1.coinsBalance, 250);

    const txs1 = await prisma.coinTransaction.findMany({
      where: { userId: user.id, type: 'WELCOME_BONUS' },
    });
    assert.equal(txs1.length, 1);

    // Run 2: rerun immediately
    const summary2 = await runWelcomeCoinsBackfill({ dryRun: false });
    // User must be skipped on rerun
    const userAfterRun2 = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(userAfterRun2.coinsBalance, 250, 'Balance must not change on rerun');

    const txs2 = await prisma.coinTransaction.findMany({
      where: { userId: user.id, type: 'WELCOME_BONUS' },
    });
    assert.equal(txs2.length, 1, 'No duplicate transaction ledger created');
  } finally {
    if (user) {
      await prisma.coinTransaction.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  }
});

test('Wallet Backfill — Inactive and soft-deleted users are strictly skipped', async () => {
  const suffix = `bf-skip-${Date.now()}`;
  let inactiveUser, deletedUser;

  try {
    inactiveUser = await prisma.user.create({
      data: {
        name: 'Inactive User',
        email: `inactive-${suffix}@example.com`,
        passwordHash: 'hash',
        coinsBalance: 0,
        isActive: false,
      },
    });

    deletedUser = await prisma.user.create({
      data: {
        name: 'Deleted User',
        email: `deleted-${suffix}@example.com`,
        passwordHash: 'hash',
        coinsBalance: 0,
        isActive: true,
        deletedAt: new Date(),
      },
    });

    await runWelcomeCoinsBackfill({ dryRun: false });

    // Verify neither received coins or transactions
    const checkInactive = await prisma.user.findUnique({ where: { id: inactiveUser.id } });
    assert.equal(checkInactive.coinsBalance, 0);
    const txInactive = await prisma.coinTransaction.findUnique({
      where: { idempotencyKey: getBackfillIdempotencyKey(inactiveUser.id) },
    });
    assert.equal(txInactive, null);

    const checkDeleted = await prisma.user.findUnique({ where: { id: deletedUser.id } });
    assert.equal(checkDeleted.coinsBalance, 0);
    const txDeleted = await prisma.coinTransaction.findUnique({
      where: { idempotencyKey: getBackfillIdempotencyKey(deletedUser.id) },
    });
    assert.equal(txDeleted, null);
  } finally {
    if (inactiveUser) {
      await prisma.user.deleteMany({ where: { id: inactiveUser.id } });
    }
    if (deletedUser) {
      await prisma.user.deleteMany({ where: { id: deletedUser.id } });
    }
  }
});

test('Wallet Backfill — Concurrency safety (two parallel runs credit each user exactly once)', async () => {
  const suffix = `bf-conc-${Date.now()}`;
  const users = [];

  try {
    for (let i = 0; i < 3; i++) {
      const u = await prisma.user.create({
        data: {
          name: `Concurrent User ${i}`,
          email: `conc-${i}-${suffix}@example.com`,
          passwordHash: 'hash',
          coinsBalance: 10,
          isActive: true,
        },
      });
      users.push(u);
    }

    // Execute 2 concurrent backfills simultaneously
    const [resultA, resultB] = await Promise.all([
      runWelcomeCoinsBackfill({ dryRun: false }),
      runWelcomeCoinsBackfill({ dryRun: false }),
    ]);

    assert.equal(resultA.failedCount, 0, 'Worker A should have 0 unhandled failures');
    assert.equal(resultB.failedCount, 0, 'Worker B should have 0 unhandled failures');

    // Verify each user has received exactly 200 coins (10 + 200 = 210) and exactly one transaction
    for (const u of users) {
      const userFinal = await prisma.user.findUnique({ where: { id: u.id } });
      assert.equal(
        userFinal.coinsBalance,
        210,
        `User ${u.id} should have exactly 210 coins after parallel execution`
      );

      const txs = await prisma.coinTransaction.findMany({
        where: { userId: u.id, type: 'WELCOME_BONUS' },
      });
      assert.equal(txs.length, 1, `User ${u.id} should have exactly one transaction`);
      assert.equal(txs[0].balanceAfter, 210);
    }
  } finally {
    for (const u of users) {
      await prisma.coinTransaction.deleteMany({ where: { userId: u.id } });
      await prisma.user.deleteMany({ where: { id: u.id } });
    }
  }
});

test('Wallet Backfill — Informational Dry-Run does not mutate data', async () => {
  const suffix = `bf-dry-${Date.now()}`;
  let user;

  try {
    user = await prisma.user.create({
      data: {
        name: 'Dry Run User',
        email: `dry-${suffix}@example.com`,
        passwordHash: 'hash',
        coinsBalance: 100,
        isActive: true,
      },
    });

    const drySummary = await runWelcomeCoinsBackfill({ dryRun: true });
    assert.equal(drySummary.dryRun, true);
    assert.ok(drySummary.totalCandidatesFound >= 1);
    assert.equal(drySummary.creditedCount, 0, 'Dry run must not credit any users');
    assert.ok(drySummary.disclaimer.includes('Informational estimate'));

    // Check database state is unchanged
    const userAfter = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(userAfter.coinsBalance, 100, 'Coins balance must be unchanged after dry run');

    const tx = await prisma.coinTransaction.findUnique({
      where: { idempotencyKey: getBackfillIdempotencyKey(user.id) },
    });
    assert.equal(tx, null, 'No transaction ledger should exist after dry run');
  } finally {
    if (user) {
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  }
});
