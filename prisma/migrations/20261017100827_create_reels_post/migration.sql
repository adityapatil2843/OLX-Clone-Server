-- CreateEnum
CREATE TYPE "ReelStatus" AS ENUM ('DRAFT', 'PROCESSING', 'PUBLISHED', 'FAILED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Reel" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "caption" TEXT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categoryId" TEXT,
    "locationText" TEXT,
    "videoStorageKey" TEXT,
    "thumbnailStorageKey" TEXT,
    "videoProvider" TEXT,
    "durationMs" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "listingId" TEXT,
    "status" "ReelStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Reel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reel_status_deletedAt_createdAt_idx" ON "Reel"("status", "deletedAt", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Reel_creatorId_deletedAt_createdAt_idx" ON "Reel"("creatorId", "deletedAt", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Reel_status_idx" ON "Reel"("status");
