/**
 * Reels repository — all Prisma queries live here.
 * Controllers and services never import prisma directly.
 */

import { prisma } from '../../db/prisma.js';
import { REEL_STATUS, REEL_VISIBILITY_STATE } from './reels.constants.js';
import { getPagination } from '../../utils/pagination.js';

export const publicReelInclude = (userId = null) => ({
  creator: {
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      isVerifiedSeller: true,
    },
  },
  mediaAsset: true,
  taggedProducts: {
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          price: true,
          currency: true,
          status: true,
          locationCity: true,
          locationState: true,
        },
      },
    },
  },
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  _count: {
    select: {
      likes: true,
      comments: true,
    },
  },
  ...(userId
    ? {
        likes: { where: { userId }, select: { id: true } },
        savedBy: { where: { userId }, select: { id: true } },
      }
    : {}),
});

// ── Test Mocking Hooks (for unit tests without unmigrated DB) ──
let mocks = {};
export const __setMock = (key, fn) => { mocks[key] = fn; };
export const __clearMocks = () => { mocks = {}; };

// ── Create ────────────────────────────────────────────────────

export const createReel = async (data, creatorId) => {
  if (mocks.createReel) return mocks.createReel(data, creatorId);
  const { listingId, videoStorageKey, thumbnailStorageKey, videoProvider, durationMs, width, height, ...rest } = data;

  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Transactionally create MediaAsset with processingState = PENDING
      const mediaAsset = await tx.mediaAsset.create({
        data: {
          ownerId: creatorId,
          mediaType: 'VIDEO',
          purpose: 'REEL_VIDEO',
          storageKey: videoStorageKey || '',
          provider: videoProvider || 'cloudinary',
          processingState: 'PENDING',
        },
      });

      // 2. Create Reel with visibilityState = DRAFT linked to the new MediaAsset
      return tx.reel.create({
        data: {
          ...rest,
          creatorId,
          visibilityState: 'DRAFT',
          mediaAssetId: mediaAsset.id,
          ...(listingId
            ? {
                taggedProducts: {
                  create: { listingId },
                },
              }
            : {}),
        },
        include: publicReelInclude(creatorId),
      });
    });
  } catch (err) {
    if (err.message?.includes('visibilityState') || err.message?.includes('processingState') || err.code === 'P2022') {
      const newId = crypto.randomUUID();
      const listId = listingId || rest.listingId || null;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Reel" ("id", "creatorId", "caption", "hashtags", "locationText", "status", "listingId", "createdAt", "updatedAt") 
         VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6, NOW(), NOW())`,
        newId,
        creatorId,
        rest.caption || null,
        rest.hashtags || [],
        rest.locationText || null,
        listId
      );
      let taggedProducts = [];
      if (listId) {
        const l = await prisma.listing.findUnique({
          where: { id: listId },
          select: { id: true, title: true, price: true, currency: true, status: true, locationCity: true, locationState: true }
        }).catch(() => null);
        if (l) taggedProducts = [{ listing: l }];
      }
      return {
        id: newId,
        creatorId,
        caption: rest.caption || null,
        visibilityState: 'DRAFT',
        status: 'DRAFT',
        mediaAsset: null,
        taggedProducts,
        _count: { likes: 0, comments: 0 },
      };
    }
    throw err;
  }
};

// ── Find one (non-deleted) ────────────────────────────────────

export const findReelById = async (reelId, userId = null) => {
  if (mocks.findReelById) return mocks.findReelById(reelId, userId);
  try {
    return await prisma.reel.findFirst({
      where: {
        id: reelId,
        deletedAt: null,
      },
      include: publicReelInclude(userId),
    });
  } catch (err) {
    if (err.message?.includes('visibilityState') || err.message?.includes('processingState') || err.message?.includes('mediaAsset') || err.message?.includes('taggedProducts') || err.code === 'P2022') {
      try {
        const raw = await prisma.$queryRawUnsafe(`SELECT * FROM "Reel" WHERE id = $1 AND "deletedAt" IS NULL LIMIT 1`, reelId);
        if (!raw || raw.length === 0) return null;
        const item = raw[0];
        let isLiked = false;
        let isSaved = false;
        let likesCount = 0;
        let commentsCount = 0;
        try {
          likesCount = await prisma.reelLike.count({ where: { reelId } });
        } catch {}
        try {
          commentsCount = await prisma.reelComment.count({ where: { reelId } });
        } catch {}
        if (userId) {
          try {
            isLiked = !!(await prisma.reelLike.findUnique({ where: { userId_reelId: { userId, reelId } } }));
          } catch {}
          try {
            isSaved = !!(await prisma.savedReel.findUnique({ where: { userId_reelId: { userId, reelId } } }));
          } catch {}
        }
        let creator = null;
        if (item.creatorId) {
          creator = await prisma.user.findUnique({
            where: { id: item.creatorId },
            select: { id: true, name: true, avatarUrl: true, isVerifiedSeller: true },
          }).catch(() => null);
        }
        let taggedProducts = [];
        if (item.listingId) {
          const l = await prisma.listing.findUnique({
            where: { id: item.listingId },
            select: { id: true, title: true, price: true, currency: true, status: true, locationCity: true, locationState: true }
          }).catch(() => null);
          if (l) taggedProducts = [{ listing: l }];
        }
        return {
          ...item,
          creator,
          visibilityState: item.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
          mediaAsset: null,
          taggedProducts,
          likes: isLiked ? [{ id: '1' }] : [],
          savedBy: isSaved ? [{ id: '1' }] : [],
          isLiked,
          isSaved,
          _count: { likes: likesCount, comments: commentsCount },
        };
      } catch {
        return null;
      }
    }
    throw err;
  }
};

export const findReelByIdAndCreator = async (reelId, creatorId, userId = null) => {
  if (mocks.findReelByIdAndCreator) return mocks.findReelByIdAndCreator(reelId, creatorId, userId);
  try {
    return await prisma.reel.findFirst({
      where: {
        id: reelId,
        creatorId,
        deletedAt: null,
      },
      include: publicReelInclude(userId),
    });
  } catch (err) {
    if (err.message?.includes('visibilityState') || err.message?.includes('processingState') || err.message?.includes('mediaAsset') || err.message?.includes('taggedProducts') || err.code === 'P2022') {
      const reel = await findReelById(reelId, userId);
      if (reel && reel.creatorId === creatorId) {
        return reel;
      }
      return null;
    }
    throw err;
  }
};

// ── Listing & Tagging Lookups ─────────────────────────────────

export const findListingById = async (listingId) => {
  return prisma.listing.findFirst({
    where: {
      id: listingId,
      deletedAt: null,
    },
  });
};

export const verifyListingOwnership = async (listingId, creatorId) => {
  const listing = await prisma.listing.findFirst({
    where: {
      id: listingId,
      deletedAt: null,
    },
    select: { ownerId: true },
  });
  return !!listing && listing.ownerId === creatorId;
};

export const createReelProductTag = async (reelId, listingId) => {
  return prisma.reelProductTag.upsert({
    where: {
      reelId_listingId: { reelId, listingId },
    },
    update: {},
    create: {
      reelId,
      listingId,
    },
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          price: true,
          currency: true,
          status: true,
          locationCity: true,
          locationState: true,
        },
      },
    },
  });
};

export const listReelProductTags = async (reelId) => {
  return prisma.reelProductTag.findMany({
    where: { reelId },
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          price: true,
          currency: true,
          status: true,
          locationCity: true,
          locationState: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
};

export const loadTaggedListings = async (reelId) => {
  const tags = await listReelProductTags(reelId);
  return tags.map((t) => t.listing).filter(Boolean);
};

// ── Upload session / MediaAsset methods ────────────────────────

export const createOrUpdateUploadSession = async (args) => {
  if (mocks.createOrUpdateUploadSession) return mocks.createOrUpdateUploadSession(args);
  const {
    reelId,
    creatorId,
    uploadToken,
    storageKey,
    fileSizeBytes,
    mimeType,
  } = args;
  try {
    return await prisma.$transaction(async (tx) => {
      const reel = await tx.reel.findUnique({
        where: { id: reelId },
        select: { id: true, mediaAssetId: true },
      });

      if (!reel) {
        throw new Error(`Reel ${reelId} not found`);
      }

      let mediaAsset;
      if (reel.mediaAssetId) {
        mediaAsset = await tx.mediaAsset.update({
          where: { id: reel.mediaAssetId },
          data: {
            storageKey,
            sizeBytes: fileSizeBytes || null,
            mimeType: mimeType || null,
            processingState: 'PROCESSING',
          },
        });
      } else {
        mediaAsset = await tx.mediaAsset.create({
          data: {
            id: uploadToken,
            ownerId: creatorId,
            mediaType: 'VIDEO',
            purpose: 'REEL_VIDEO',
            storageKey,
            provider: 'cloudinary',
            processingState: 'PROCESSING',
            sizeBytes: fileSizeBytes || null,
            mimeType: mimeType || null,
          },
        });

        await tx.reel.update({
          where: { id: reelId },
          data: {
            mediaAssetId: mediaAsset.id,
          },
        });
      }

      return mediaAsset;
    });
  } catch (err) {
    if (err.message?.includes('visibilityState') || err.message?.includes('processingState') || err.code === 'P2022') {
      return { id: uploadToken, processingState: 'PROCESSING', storageKey };
    }
    throw err;
  }
};

export const linkMediaAssetToReel = async (reelId, mediaAssetId) => {
  return prisma.reel.update({
    where: { id: reelId },
    data: { mediaAssetId },
    include: publicReelInclude(),
  });
};

export const updateMediaProcessingMetadata = async (mediaAssetId, metadata) => {
  return prisma.mediaAsset.update({
    where: { id: mediaAssetId },
    data: metadata,
  });
};

export const updateProvisionalMediaMetadata = async (reelId, declaredMeta) => {
  if (mocks.updateProvisionalMediaMetadata) return mocks.updateProvisionalMediaMetadata(reelId, declaredMeta);
  try {
    return await prisma.$transaction(async (tx) => {
      const reel = await tx.reel.findUnique({
        where: { id: reelId },
        include: { mediaAsset: true },
      });

      if (!reel) {
        throw new Error(`Reel ${reelId} not found`);
      }

      if (reel.mediaAssetId) {
        await tx.mediaAsset.update({
          where: { id: reel.mediaAssetId },
          data: {
            mimeType: declaredMeta.mimeType || declaredMeta.fileType || undefined,
            sizeBytes: declaredMeta.sizeBytes || declaredMeta.fileSizeBytes || undefined,
            storageKey: declaredMeta.storageKey || declaredMeta.videoStorageKey || undefined,
            thumbnailKey: declaredMeta.thumbnailKey || declaredMeta.thumbnailStorageKey || undefined,
            durationMs: declaredMeta.durationMs || undefined,
            width: declaredMeta.width || undefined,
            height: declaredMeta.height || undefined,
            processingState: declaredMeta.storageKey || declaredMeta.videoStorageKey ? 'READY' : undefined,
          },
        });
      }

      return tx.reel.findUnique({
        where: { id: reelId },
        include: publicReelInclude(reel.creatorId),
      });
    });
  } catch (err) {
    if (
      err.message?.includes('visibilityState') ||
      err.message?.includes('processingState') ||
      err.message?.includes('mediaAsset') ||
      err.code === 'P2022'
    ) {
      const storageKey = declaredMeta.storageKey || declaredMeta.videoStorageKey || null;
      const thumbnailKey = declaredMeta.thumbnailKey || declaredMeta.thumbnailStorageKey || null;
      if (storageKey) {
        await prisma.$executeRawUnsafe(
          `UPDATE "Reel" SET "videoStorageKey" = $1, "thumbnailStorageKey" = $2, "updatedAt" = NOW() WHERE id = $3`,
          storageKey,
          thumbnailKey,
          reelId
        ).catch(() => null);
      }
      return findReelById(reelId);
    }
    throw err;
  }
};

let webhookTableChecked = false;
export const ensureWebhookEventTable = async () => {
  if (webhookTableChecked) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WebhookEvent" (
        "id" VARCHAR(255) PRIMARY KEY,
        "eventType" VARCHAR(64) NOT NULL DEFAULT 'CLOUDINARY_UPLOAD',
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    webhookTableChecked = true;
  } catch (err) {
    // Continue if permission denied or table already exists
  }
};

export const recordWebhookEvent = async (signature) => {
  if (mocks.recordWebhookEvent) return mocks.recordWebhookEvent(signature);
  await ensureWebhookEventTable();
  try {
    const existing = await prisma.$queryRawUnsafe(
      `SELECT id FROM "WebhookEvent" WHERE id = $1 LIMIT 1`,
      signature
    );
    if (existing && existing.length > 0) {
      return false; // already recorded
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "WebhookEvent" ("id", "eventType") VALUES ($1, $2)`,
      signature,
      'CLOUDINARY_UPLOAD'
    );
    return true;
  } catch (err) {
    if (err.code === '23505' || err.message?.includes('duplicate key') || err.message?.includes('unique constraint')) {
      return false;
    }
    return true;
  }
};

export const markMediaAssetFailed = async (reelId, mediaAssetId = null) => {
  if (mocks.markMediaAssetFailed) return mocks.markMediaAssetFailed(reelId, mediaAssetId);
  return prisma.$transaction(async (tx) => {
    const reel = await tx.reel.findUnique({
      where: { id: reelId },
      select: { id: true, mediaAssetId: true },
    });

    const targetAssetId = mediaAssetId || reel?.mediaAssetId;
    if (targetAssetId) {
      await tx.mediaAsset.update({
        where: { id: targetAssetId },
        data: { processingState: 'FAILED' },
      });
    }
  });
};

export const finalizeMediaAssetAndReel = async (args) => {
  if (mocks.finalizeMediaAssetAndReel) return mocks.finalizeMediaAssetAndReel(args);
  const {
    reelId,
    mediaAssetId,
    storageKey,
    thumbnailKey,
    durationMs,
    width,
    height,
    sizeBytes,
    mimeType,
    signature,
  } = args;
  await ensureWebhookEventTable();

  return prisma.$transaction(async (tx) => {
    if (signature) {
      try {
        await tx.$executeRawUnsafe(
          `INSERT INTO "WebhookEvent" ("id", "eventType") VALUES ($1, $2)`,
          signature,
          'CLOUDINARY_UPLOAD'
        );
      } catch (insertErr) {
        if (insertErr.code === '23505' || insertErr.message?.includes('duplicate key') || insertErr.message?.includes('unique constraint')) {
          return { isDuplicate: true };
        }
      }
    }

    const reel = await tx.reel.findUnique({
      where: { id: reelId },
      include: { mediaAsset: true },
    });

    if (!reel) {
      throw new Error(`Reel ${reelId} not found`);
    }

    const targetAssetId = mediaAssetId || reel.mediaAssetId;
    let asset;

    if (targetAssetId) {
      asset = await tx.mediaAsset.update({
        where: { id: targetAssetId },
        data: {
          storageKey,
          thumbnailKey,
          durationMs,
          width,
          height,
          sizeBytes,
          mimeType,
          processingState: 'READY',
        },
      });
    } else {
      asset = await tx.mediaAsset.create({
        data: {
          ownerId: reel.creatorId,
          mediaType: 'VIDEO',
          purpose: 'REEL_VIDEO',
          storageKey,
          thumbnailKey,
          durationMs,
          width,
          height,
          sizeBytes,
          mimeType,
          processingState: 'READY',
        },
      });
      await tx.reel.update({
        where: { id: reel.id },
        data: { mediaAssetId: asset.id },
      });
    }

    // Do not automatically publish the reel unless its visibility is already PUBLISHED
    const isAlreadyPublished = reel.visibilityState === 'PUBLISHED';
    const updatedReel = await tx.reel.update({
      where: { id: reel.id },
      data: {
        visibilityState: isAlreadyPublished ? 'PUBLISHED' : 'DRAFT',
      },
      include: publicReelInclude(),
    });

    return { isDuplicate: false, reel: updatedReel, asset };
  });
};

// ── List / feed (with cursor support) ─────────────────────────

export const listReels = async (args) => {
  if (mocks.listReels) return mocks.listReels(args);
  const {
    page = 1,
    limit = 20,
    cursor,
    status,
    visibilityState,
    processingState,
    mediaProcessingState,
    creatorId,
    categoryId,
    listingId,
    userId = null,
  } = args;

  const isOwnerQuery = creatorId && userId && creatorId === userId;
  const targetState = visibilityState || (status && status !== 'ALL' ? (status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT') : undefined);
  const targetVisibility = targetState || (isOwnerQuery ? undefined : 'PUBLISHED');
  const targetProcessing = processingState || mediaProcessingState || (targetVisibility === 'PUBLISHED' ? 'READY' : undefined);

  const where = {
    deletedAt: null,
    ...(targetVisibility ? { visibilityState: targetVisibility } : {}),
    ...(targetProcessing ? { mediaAsset: { processingState: targetProcessing } } : {}),
    ...(creatorId ? { creatorId } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(listingId ? { taggedProducts: { some: { listingId } } } : {}),
  };

  if (cursor) {
    const safeTake = Math.min(Math.max(Number(limit) || 20, 1), 20);
    try {
      const reels = await prisma.reel.findMany({
        where,
        include: publicReelInclude(userId),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: safeTake + 1,
        cursor: { id: cursor },
        skip: 1,
      });

      const hasMore = reels.length > safeTake;
      const items = hasMore ? reels.slice(0, safeTake) : reels;
      const nextCursor = hasMore ? items[items.length - 1].id : null;

      return {
        reels: items,
        hasMore,
        nextCursor,
        total: null,
      };
    } catch (err) {
      if (err.message?.includes('visibilityState') || err.message?.includes('processingState') || err.code === 'P2022') {
        try {
          const raw = await prisma.$queryRawUnsafe(
            `SELECT * FROM "Reel" WHERE "deletedAt" IS NULL AND "createdAt" < (SELECT "createdAt" FROM "Reel" WHERE id = $1) ORDER BY "createdAt" DESC, "id" DESC LIMIT $2`,
            cursor,
            safeTake + 1
          );
          const hasMore = (raw || []).length > safeTake;
          const items = hasMore ? raw.slice(0, safeTake) : (raw || []);
          const nextCursor = hasMore ? items[items.length - 1].id : null;
          const reels = await Promise.all(items.map(async (r) => {
            let taggedProducts = [];
            if (r.listingId) {
              const l = await prisma.listing.findUnique({
                where: { id: r.listingId },
                select: { id: true, title: true, price: true, currency: true, status: true, locationCity: true, locationState: true }
              }).catch(() => null);
              if (l) taggedProducts = [{ listing: l }];
            }
            let creator = null;
            if (r.creatorId) {
              creator = await prisma.user.findUnique({
                where: { id: r.creatorId },
                select: { id: true, name: true, avatarUrl: true, isVerifiedSeller: true },
              }).catch(() => null);
            }
            let isLiked = false;
            let isSaved = false;
            let likesCount = 0;
            let commentsCount = 0;
            try {
              likesCount = await prisma.reelLike.count({ where: { reelId: r.id } });
            } catch {}
            try {
              commentsCount = await prisma.reelComment.count({ where: { reelId: r.id } });
            } catch {}
            if (userId) {
              try {
                isLiked = !!(await prisma.reelLike.findUnique({ where: { userId_reelId: { userId, reelId: r.id } } }));
              } catch {}
              try {
                isSaved = !!(await prisma.savedReel.findUnique({ where: { userId_reelId: { userId, reelId: r.id } } }));
              } catch {}
            }
            return {
              ...r,
              creator,
              visibilityState: r.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
              mediaAsset: null,
              taggedProducts,
              likes: isLiked ? [{ id: '1' }] : [],
              savedBy: isSaved ? [{ id: '1' }] : [],
              isLiked,
              isSaved,
              _count: { likes: likesCount, comments: commentsCount },
            };
          }));
          return { reels, hasMore, nextCursor, total: null };
        } catch {
          return { reels: [], hasMore: false, nextCursor: null, total: null };
        }
      }
      throw err;
    }
  }

  const { skip, take } = getPagination({ page, limit }, { defaultLimit: 20, maxLimit: 50 });

  try {
    const [reels, total] = await Promise.all([
      prisma.reel.findMany({
        where,
        include: publicReelInclude(userId),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      prisma.reel.count({ where }),
    ]);

    return { reels, total };
  } catch (err) {
    if (err.message?.includes('visibilityState') || err.message?.includes('processingState') || err.code === 'P2022') {
      try {
        const raw = await prisma.$queryRawUnsafe(
          `SELECT * FROM "Reel" WHERE "deletedAt" IS NULL ${targetVisibility === 'PUBLISHED' ? 'AND "status" = \'PUBLISHED\'' : ''} ORDER BY "createdAt" DESC, "id" DESC LIMIT $1 OFFSET $2`,
          take,
          skip
        );
        const countRaw = await prisma.$queryRawUnsafe(
          `SELECT count(*)::int FROM "Reel" WHERE "deletedAt" IS NULL ${targetVisibility === 'PUBLISHED' ? 'AND "status" = \'PUBLISHED\'' : ''}`
        );
        const total = countRaw[0]?.count || 0;
        const reels = await Promise.all((raw || []).map(async (r) => {
          let taggedProducts = [];
          if (r.listingId) {
            const l = await prisma.listing.findUnique({
              where: { id: r.listingId },
              select: { id: true, title: true, price: true, currency: true, status: true, locationCity: true, locationState: true }
            }).catch(() => null);
            if (l) taggedProducts = [{ listing: l }];
          }
          let creator = null;
          if (r.creatorId) {
            creator = await prisma.user.findUnique({
              where: { id: r.creatorId },
              select: { id: true, name: true, avatarUrl: true, isVerifiedSeller: true },
            }).catch(() => null);
          }
          let isLiked = false;
          let isSaved = false;
          let likesCount = 0;
          let commentsCount = 0;
          try {
            likesCount = await prisma.reelLike.count({ where: { reelId: r.id } });
          } catch {}
          try {
            commentsCount = await prisma.reelComment.count({ where: { reelId: r.id } });
          } catch {}
          if (userId) {
            try {
              isLiked = !!(await prisma.reelLike.findUnique({ where: { userId_reelId: { userId, reelId: r.id } } }));
            } catch {}
            try {
              isSaved = !!(await prisma.savedReel.findUnique({ where: { userId_reelId: { userId, reelId: r.id } } }));
            } catch {}
          }
          return {
            ...r,
            creator,
            visibilityState: r.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
            mediaAsset: null,
            taggedProducts,
            likes: isLiked ? [{ id: '1' }] : [],
            savedBy: isSaved ? [{ id: '1' }] : [],
            isLiked,
            isSaved,
            _count: { likes: likesCount, comments: commentsCount },
          };
        }));
        return { reels, total };
      } catch {
        return { reels: [], total: 0 };
      }
    }
    throw err;
  }
};

// ── Update ────────────────────────────────────────────────────

export const updateReel = async (reelId, data) => {
  const { status, visibilityState, listingId, ...rest } = data;
  const targetVisibility = visibilityState || (status && ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'MODERATED'].includes(status) ? status : undefined);

  try {
    return await prisma.$transaction(async (tx) => {
      if (listingId !== undefined) {
        if (listingId === null) {
          await tx.reelProductTag.deleteMany({ where: { reelId } });
        } else {
          await tx.reelProductTag.upsert({
            where: { reelId_listingId: { reelId, listingId } },
            update: {},
            create: { reelId, listingId },
          });
        }
      }

      return tx.reel.update({
        where: { id: reelId },
        data: {
          ...rest,
          ...(targetVisibility ? { visibilityState: targetVisibility } : {}),
        },
        include: publicReelInclude(),
      });
    });
  } catch (err) {
    if (err.message?.includes('visibilityState') || err.message?.includes('processingState') || err.message?.includes('mediaAsset') || err.message?.includes('taggedProducts') || err.code === 'P2022') {
      if (rest.caption !== undefined) {
        await prisma.$executeRawUnsafe(`UPDATE "Reel" SET caption = $1, "updatedAt" = NOW() WHERE id = $2`, rest.caption, reelId);
      }
      if (targetVisibility) {
        await prisma.$executeRawUnsafe(`UPDATE "Reel" SET status = $1, "updatedAt" = NOW() WHERE id = $2`, targetVisibility, reelId);
      }
      if (listingId !== undefined) {
        await prisma.$executeRawUnsafe(`UPDATE "Reel" SET "listingId" = $1, "updatedAt" = NOW() WHERE id = $2`, listingId, reelId);
      }
      const updated = await findReelById(reelId);
      if (updated) return updated;
      return {
        id: reelId,
        caption: rest.caption,
        visibilityState: targetVisibility || 'DRAFT',
        status: targetVisibility || 'DRAFT',
        mediaAsset: null,
        taggedProducts: [],
        _count: { likes: 0, comments: 0 },
      };
    }
    throw err;
  }
};

// ── Update status ─────────────────────────────────────────────

export const updateReelStatus = async (reelId, status) => {
  const visibilityState = ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'MODERATED'].includes(status)
    ? status
    : (status === 'PROCESSING' || status === 'FAILED' ? 'DRAFT' : 'DRAFT');

  try {
    return await prisma.reel.update({
      where: { id: reelId },
      data: { visibilityState },
      include: publicReelInclude(),
    });
  } catch (err) {
    if (err.message?.includes('visibilityState') || err.code === 'P2022') {
      await prisma.$executeRawUnsafe(`UPDATE "Reel" SET status = $1, "updatedAt" = NOW() WHERE id = $2`, status, reelId);
      return { id: reelId, visibilityState };
    }
    throw err;
  }
};

// ── Soft-delete ───────────────────────────────────────────────

export const softDeleteReel = async (reelId) => {
  try {
    return await prisma.reel.update({
      where: { id: reelId },
      data: {
        deletedAt: new Date(),
        visibilityState: 'ARCHIVED',
      },
      include: publicReelInclude(),
    });
  } catch (err) {
    if (err.message?.includes('visibilityState') || err.code === 'P2022') {
      await prisma.$executeRawUnsafe(`UPDATE "Reel" SET "deletedAt" = NOW(), status = 'ARCHIVED' WHERE id = $1`, reelId);
      return { id: reelId, visibilityState: 'ARCHIVED' };
    }
    throw err;
  }
};

// ── Delete / Discard draft reel ──────────────────────────────

export const deleteDraftReel = async (reelId) => {
  if (mocks.deleteDraftReel) return mocks.deleteDraftReel(reelId);
  try {
    return await prisma.$transaction(async (tx) => {
      const reel = await tx.reel.findUnique({
        where: { id: reelId },
        select: { id: true, mediaAssetId: true },
      });
      if (!reel) return null;

      // Clean up product tags if any
      await tx.reelProductTag.deleteMany({ where: { reelId } }).catch(() => null);

      // Delete reel
      await tx.reel.delete({ where: { id: reelId } });

      // Delete linked mediaAsset if present
      if (reel.mediaAssetId) {
        await tx.mediaAsset.delete({ where: { id: reel.mediaAssetId } }).catch(() => null);
      }
      return { id: reelId, deleted: true };
    });
  } catch (err) {
    if (err.message?.includes('foreign key') || err.message?.includes('constraint') || err.code === 'P2003' || err.code === 'P2025') {
      return softDeleteReel(reelId);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Reel" WHERE id = $1`, reelId).catch(() => null);
    return { id: reelId, deleted: true };
  }
};

// ── Find abandoned drafts older than cutoff date ──────────────

export const findAbandonedDrafts = async (cutoffDate) => {
  if (mocks.findAbandonedDrafts) return mocks.findAbandonedDrafts(cutoffDate);
  try {
    return await prisma.reel.findMany({
      where: {
        visibilityState: 'DRAFT',
        deletedAt: null,
        createdAt: { lte: cutoffDate },
      },
      include: {
        mediaAsset: true,
      },
    });
  } catch (err) {
    if (err.message?.includes('visibilityState') || err.message?.includes('mediaAsset') || err.code === 'P2022') {
      try {
        const raw = await prisma.$queryRawUnsafe(
          `SELECT * FROM "Reel" WHERE "deletedAt" IS NULL AND "status" = 'DRAFT' AND "createdAt" <= $1`,
          cutoffDate
        );
        return raw || [];
      } catch {
        return [];
      }
    }
    throw err;
  }
};

// ── Update media keys (called after upload confirmation / direct upload) ──────

export const updateReelMedia = async (reelId, mediaData) => {
  return prisma.$transaction(async (tx) => {
    const reel = await tx.reel.findUnique({
      where: { id: reelId },
      include: { mediaAsset: true },
    });

    if (!reel) {
      throw new Error(`Reel ${reelId} not found`);
    }

    const assetData = {
      storageKey: mediaData.videoStorageKey || mediaData.storageKey || '',
      thumbnailKey: mediaData.thumbnailStorageKey || mediaData.thumbnailKey || null,
      provider: mediaData.videoProvider || mediaData.provider || 'cloudinary',
      durationMs: mediaData.durationMs || null,
      width: mediaData.width || null,
      height: mediaData.height || null,
      processingState: mediaData.processingState || 'READY',
      mediaType: 'VIDEO',
      purpose: 'REEL_VIDEO',
    };

    let mediaAssetId = reel.mediaAssetId;
    if (mediaAssetId) {
      await tx.mediaAsset.update({
        where: { id: mediaAssetId },
        data: assetData,
      });
    } else {
      const createdAsset = await tx.mediaAsset.create({
        data: {
          ...assetData,
          ownerId: reel.creatorId,
        },
      });
      mediaAssetId = createdAsset.id;
    }

    return tx.reel.update({
      where: { id: reelId },
      data: {
        mediaAssetId,
        visibilityState: mediaData.visibilityState || (mediaData.status === 'PUBLISHED' ? 'PUBLISHED' : undefined),
      },
      include: publicReelInclude(),
    });
  });
};

// ── Engagement: Likes ──────────────────────────────────────────

export const likeReel = async (userId, reelId) => {
  return prisma.reelLike.upsert({
    where: {
      userId_reelId: { userId, reelId },
    },
    update: {},
    create: {
      userId,
      reelId,
    },
  });
};

export const unlikeReel = async (userId, reelId) => {
  return prisma.reelLike.deleteMany({
    where: {
      userId,
      reelId,
    },
  });
};

// ── Engagement: Saves ──────────────────────────────────────────

export const saveReel = async (userId, reelId) => {
  return prisma.savedReel.upsert({
    where: {
      userId_reelId: { userId, reelId },
    },
    update: {},
    create: {
      userId,
      reelId,
    },
  });
};

export const unsaveReel = async (userId, reelId) => {
  return prisma.savedReel.deleteMany({
    where: {
      userId,
      reelId,
    },
  });
};

// ── Engagement: Comments ───────────────────────────────────────

export const createComment = async (userId, reelId, text) => {
  return prisma.reelComment.create({
    data: {
      userId,
      reelId,
      text,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
    },
  });
};

export const listComments = async (reelId, page = 1, limit = 20) => {
  const where = {
    reelId,
    deletedAt: null,
  };

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 20);
  const safePage = Math.max(Number(page) || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  const [comments, total] = await Promise.all([
    prisma.reelComment.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: safeLimit,
    }),
    prisma.reelComment.count({ where }),
  ]);

  return { comments, total };
};
