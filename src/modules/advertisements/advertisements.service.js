import * as repo from './advertisements.repository.js';
import * as boostPackageRepo from '../boost-packages/boost-packages.repository.js';
import * as walletRepo from '../wallet/wallet.repository.js';
import { prisma } from '../../db/prisma.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../utils/errors.js';
import { AD_STATUS, AD_TARGET_TYPE, AD_MESSAGES } from './advertisements.constants.js';
import { COIN_TRANSACTION_TYPE } from '../wallet/wallet.constants.js';

export const createAdvertisement = async (payload, ownerId) => {
  const { targetType, targetId, packageId, idempotencyKey } = payload;

  // 1. Idempotency fast check
  if (idempotencyKey) {
    const existingTx = await walletRepo.findTransactionByIdempotencyKey(idempotencyKey);
    if (existingTx && existingTx.referenceId) {
      const existingAd = await repo.findAdvertisementById(existingTx.referenceId);
      if (existingAd) {
        return existingAd;
      }
    }
  }

  // 2. Validate package
  const pkg = await boostPackageRepo.findPackageById(packageId);
  if (!pkg) {
    throw new NotFoundError(AD_MESSAGES.PACKAGE_NOT_FOUND);
  }
  if (!pkg.isActive) {
    throw new BadRequestError(AD_MESSAGES.PACKAGE_INACTIVE);
  }

  // 3. Validate target ownership and eligibility
  let listingId = null;
  let reelId = null;

  if (targetType === AD_TARGET_TYPE.LISTING) {
    const listing = await prisma.listing.findUnique({
      where: { id: targetId },
    });

    if (!listing || listing.deletedAt) {
      throw new NotFoundError(AD_MESSAGES.TARGET_NOT_FOUND);
    }
    if (listing.ownerId !== ownerId) {
      throw new ForbiddenError(AD_MESSAGES.FORBIDDEN_TARGET);
    }
    if (listing.status !== 'ACTIVE') {
      throw new BadRequestError(`Cannot advertise a listing in status '${listing.status}'`);
    }
    listingId = targetId;
  } else if (targetType === AD_TARGET_TYPE.REEL) {
    const reel = await prisma.reel.findUnique({
      where: { id: targetId },
    });

    if (!reel || reel.deletedAt) {
      throw new NotFoundError(AD_MESSAGES.TARGET_NOT_FOUND);
    }
    if (reel.creatorId !== ownerId) {
      throw new ForbiddenError(AD_MESSAGES.FORBIDDEN_TARGET);
    }
    const reelState = reel.visibilityState || reel.status;
    if (reelState !== 'PUBLISHED') {
      throw new BadRequestError(`Cannot advertise a reel in status '${reelState}'`);
    }
    reelId = targetId;
  }

  // 4. Reject if target already has an ACTIVE boost
  const existingActiveBoost = await repo.findActiveBoostByTarget(targetType, targetId);
  if (existingActiveBoost) {
    throw new BadRequestError(AD_MESSAGES.ACTIVE_BOOST_EXISTS);
  }

  // 5. Calculate schedule on server
  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + pkg.durationDays * 24 * 60 * 60 * 1000);

  // 6. Execute atomic transaction (debit coins, create ad, record ledger)
  try {
    return await prisma.$transaction(async (tx) => {
      // 6a. Atomic balance check & debit to prevent overspending
      const balanceAfter = await walletRepo.atomicDebitUserCoins(ownerId, pkg.coinsCost, tx);
      if (balanceAfter === null) {
        throw new BadRequestError(AD_MESSAGES.INSUFFICIENT_COINS);
      }

      // 6b. Create advertisement with snapshot
      const ad = await repo.createAdvertisement(
        {
          ownerId,
          targetType,
          targetId,
          packageId: pkg.id,
          packageDays: pkg.durationDays,
          coinsSpent: pkg.coinsCost,
          title: `${pkg.name} Boost`,
          status: AD_STATUS.ACTIVE,
          startDate,
          endDate,
          listingId,
          reelId,
        },
        tx
      );

      // 6c. Record ledger entry
      await walletRepo.createCoinTransaction(
        {
          userId: ownerId,
          amount: -pkg.coinsCost,
          balanceAfter,
          type: COIN_TRANSACTION_TYPE.BOOST_SPENT,
          reason: `Boost spent for ${targetType.toLowerCase()}`,
          referenceType: 'ADVERTISEMENT',
          referenceId: ad.id,
          idempotencyKey: idempotencyKey || null,
        },
        tx
      );

      return ad;
    });
  } catch (err) {
    // If concurrent request hit partial unique index
    if (err.code === 'P2002' || err.message?.includes('Advertisement_active_target_unique')) {
      throw new BadRequestError(AD_MESSAGES.ACTIVE_BOOST_EXISTS);
    }
    throw err;
  }
};

export const getAdvertisement = async (id, ownerId, userRole = 'USER') => {
  const ad = await repo.findAdvertisementById(id);
  if (!ad) {
    throw new NotFoundError(AD_MESSAGES.AD_NOT_FOUND);
  }

  if (ad.ownerId !== ownerId && userRole !== 'ADMIN' && userRole !== 'MODERATOR') {
    throw new ForbiddenError(AD_MESSAGES.FORBIDDEN_VIEW);
  }

  return ad;
};

export const listMyAdvertisements = async (ownerId, query) => {
  const { status, page = 1, limit = 20 } = query;
  const result = await repo.listAdvertisementsByOwner({
    ownerId,
    status,
    page,
    limit,
  });

  return {
    data: result.ads,
    meta: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
      hasNextPage: page * limit < result.total,
    },
  };
};

export const cancelAdvertisement = async (id, ownerId, userRole = 'USER') => {
  const ad = await repo.findAdvertisementById(id);
  if (!ad) {
    throw new NotFoundError(AD_MESSAGES.AD_NOT_FOUND);
  }

  if (ad.ownerId !== ownerId && userRole !== 'ADMIN') {
    throw new ForbiddenError(AD_MESSAGES.FORBIDDEN_ACTION);
  }

  if (ad.status === AD_STATUS.CANCELLED) {
    return ad; // Idempotent
  }

  return repo.updateAdvertisementStatus(id, AD_STATUS.CANCELLED, new Date());
};

export const stopAdvertisement = async (id, ownerId, userRole = 'USER') => {
  return cancelAdvertisement(id, ownerId, userRole);
};

export const pauseAdvertisement = async (id, ownerId, userRole = 'USER') => {
  const ad = await repo.findAdvertisementById(id);
  if (!ad) {
    throw new NotFoundError(AD_MESSAGES.AD_NOT_FOUND);
  }

  if (ad.ownerId !== ownerId && userRole !== 'ADMIN') {
    throw new ForbiddenError(AD_MESSAGES.FORBIDDEN_ACTION);
  }

  if (ad.status === AD_STATUS.PAUSED) {
    return ad; // Idempotent
  }

  if (ad.status !== AD_STATUS.ACTIVE) {
    throw new BadRequestError(`Cannot pause an advertisement in status '${ad.status}'`);
  }

  return repo.updateAdvertisementStatus(id, AD_STATUS.PAUSED, null);
};

export const stopListingAdvertisements = async (listingId) => {
  return repo.cancelCampaignsForListing(listingId);
};
