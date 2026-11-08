-- Step 1: Create new enums safely
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MediaProcessingState') THEN
        CREATE TYPE "MediaProcessingState" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReelVisibilityState') THEN
        CREATE TYPE "ReelVisibilityState" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED', 'MODERATED');
    END IF;
END $$;

-- Step 2: Ensure MediaAsset table exists (with support for environments where it was not part of prior migrations)
CREATE TABLE IF NOT EXISTS "MediaAsset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'cloudinary',
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "durationMs" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "thumbnailKey" TEXT,
    "processingState" "MediaProcessingState" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- Ensure processingState column exists on MediaAsset if table already existed with legacy status text column
ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "processingState" "MediaProcessingState" NOT NULL DEFAULT 'PENDING';

-- Backfill processingState from legacy MediaAsset.status if present
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'MediaAsset' AND column_name = 'status'
    ) THEN
        UPDATE "MediaAsset"
        SET "processingState" = CASE
            WHEN UPPER("status") = 'READY' THEN 'READY'::"MediaProcessingState"
            WHEN UPPER("status") = 'PROCESSING' THEN 'PROCESSING'::"MediaProcessingState"
            WHEN UPPER("status") = 'FAILED' THEN 'FAILED'::"MediaProcessingState"
            ELSE 'PENDING'::"MediaProcessingState"
        END;
    END IF;
END $$;

-- Ensure MediaAsset indexes and foreign keys exist
CREATE INDEX IF NOT EXISTS "MediaAsset_ownerId_createdAt_idx" ON "MediaAsset"("ownerId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "MediaAsset_storageKey_idx" ON "MediaAsset"("storageKey");

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'MediaAsset_ownerId_fkey' AND table_name = 'MediaAsset'
    ) THEN
        ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_ownerId_fkey" 
            FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Step 3: Ensure Reel table has new columns before data migration
ALTER TABLE "Reel" ADD COLUMN IF NOT EXISTS "visibilityState" "ReelVisibilityState" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "Reel" ADD COLUMN IF NOT EXISTS "mediaAssetId" TEXT;

-- Step 4: Data Migration - Backfill Reel.visibilityState from legacy Reel.status
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Reel' AND column_name = 'status'
    ) THEN
        UPDATE "Reel"
        SET "visibilityState" = CASE
            WHEN "status"::text = 'PUBLISHED' THEN 'PUBLISHED'::"ReelVisibilityState"
            WHEN "status"::text = 'ARCHIVED' THEN 'ARCHIVED'::"ReelVisibilityState"
            WHEN "status"::text = 'DRAFT' THEN 'DRAFT'::"ReelVisibilityState"
            WHEN "status"::text IN ('PROCESSING', 'FAILED') THEN 'DRAFT'::"ReelVisibilityState"
            ELSE 'DRAFT'::"ReelVisibilityState"
        END;
    END IF;
END $$;

-- Step 5: Data Migration - Create MediaAsset records for existing reels with media fields
DO $$
DECLARE
    r RECORD;
    new_asset_id TEXT;
    asset_processing_state "MediaProcessingState";
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Reel' AND column_name = 'videoStorageKey'
    ) THEN
        FOR r IN 
            SELECT id, "creatorId", "videoStorageKey", "thumbnailStorageKey", 
                   "videoProvider", "durationMs", width, height, "createdAt", 
                   status::text as status_text, "mediaAssetId"
            FROM "Reel"
            WHERE ("videoStorageKey" IS NOT NULL OR "thumbnailStorageKey" IS NOT NULL)
              AND "mediaAssetId" IS NULL
        LOOP
            new_asset_id := gen_random_uuid()::text;
            
            IF r."videoStorageKey" IS NOT NULL AND r.status_text = 'PUBLISHED' THEN
                asset_processing_state := 'READY'::"MediaProcessingState";
            ELSIF r.status_text = 'PROCESSING' THEN
                asset_processing_state := 'PROCESSING'::"MediaProcessingState";
            ELSIF r.status_text = 'FAILED' THEN
                asset_processing_state := 'FAILED'::"MediaProcessingState";
            ELSIF r."videoStorageKey" IS NULL THEN
                asset_processing_state := 'PENDING'::"MediaProcessingState";
            ELSE
                asset_processing_state := 'READY'::"MediaProcessingState";
            END IF;

            INSERT INTO "MediaAsset" (
                "id", "ownerId", "mediaType", "purpose", "storageKey", "provider",
                "durationMs", "width", "height", "thumbnailKey",
                "processingState", "createdAt"
            ) VALUES (
                new_asset_id,
                r."creatorId",
                'VIDEO',
                'REEL_VIDEO',
                COALESCE(r."videoStorageKey", r."thumbnailStorageKey", ''),
                COALESCE(r."videoProvider", 'cloudinary'),
                r."durationMs",
                r.width,
                r.height,
                r."thumbnailStorageKey",
                asset_processing_state,
                r."createdAt"
            );

            UPDATE "Reel"
            SET "mediaAssetId" = new_asset_id
            WHERE id = r.id;
        END LOOP;
    END IF;
END $$;

-- Step 6: Create ReelProductTag table & copy Reel.listingId values
CREATE TABLE IF NOT EXISTS "ReelProductTag" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReelProductTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReelProductTag_reelId_listingId_key" ON "ReelProductTag"("reelId", "listingId");
CREATE INDEX IF NOT EXISTS "ReelProductTag_listingId_idx" ON "ReelProductTag"("listingId");

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'ReelProductTag_reelId_fkey' AND table_name = 'ReelProductTag'
    ) THEN
        ALTER TABLE "ReelProductTag" ADD CONSTRAINT "ReelProductTag_reelId_fkey" 
            FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'ReelProductTag_listingId_fkey' AND table_name = 'ReelProductTag'
    ) THEN
        ALTER TABLE "ReelProductTag" ADD CONSTRAINT "ReelProductTag_listingId_fkey" 
            FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Data Migration: Convert existing Reel.listingId values into ReelProductTag rows safely
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Reel' AND column_name = 'listingId'
    ) THEN
        INSERT INTO "ReelProductTag" ("id", "reelId", "listingId", "createdAt")
        SELECT 
            gen_random_uuid()::text,
            r.id,
            r."listingId",
            r."createdAt"
        FROM "Reel" r
        INNER JOIN "Listing" l ON r."listingId" = l.id
        WHERE r."listingId" IS NOT NULL
        ON CONFLICT ("reelId", "listingId") DO NOTHING;
    END IF;
END $$;

-- Step 7: Enforce 1-to-1 unique constraint on Reel.mediaAssetId and foreign key
CREATE UNIQUE INDEX IF NOT EXISTS "Reel_mediaAssetId_key" ON "Reel"("mediaAssetId");

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'Reel_mediaAssetId_fkey' AND table_name = 'Reel'
    ) THEN
        ALTER TABLE "Reel" ADD CONSTRAINT "Reel_mediaAssetId_fkey" 
            FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Step 8: Update Reel indexes for visibilityState
DROP INDEX IF EXISTS "Reel_status_deletedAt_createdAt_idx";
DROP INDEX IF EXISTS "Reel_status_idx";
DROP INDEX IF EXISTS "Reel_listingId_idx";

CREATE INDEX IF NOT EXISTS "Reel_visibilityState_deletedAt_createdAt_idx" ON "Reel"("visibilityState", "deletedAt", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Reel_visibilityState_idx" ON "Reel"("visibilityState");

-- Step 9: Cleanup legacy columns and enum after data has been copied
ALTER TABLE "Reel" DROP CONSTRAINT IF EXISTS "Reel_listingId_fkey";
ALTER TABLE "Reel" DROP COLUMN IF EXISTS "videoStorageKey";
ALTER TABLE "Reel" DROP COLUMN IF EXISTS "thumbnailStorageKey";
ALTER TABLE "Reel" DROP COLUMN IF EXISTS "videoProvider";
ALTER TABLE "Reel" DROP COLUMN IF EXISTS "durationMs";
ALTER TABLE "Reel" DROP COLUMN IF EXISTS "width";
ALTER TABLE "Reel" DROP COLUMN IF EXISTS "height";
ALTER TABLE "Reel" DROP COLUMN IF EXISTS "listingId";
ALTER TABLE "Reel" DROP COLUMN IF EXISTS "status";

-- Drop legacy ReelStatus enum
DROP TYPE IF EXISTS "ReelStatus";

-- Drop legacy status column from MediaAsset
ALTER TABLE "MediaAsset" DROP COLUMN IF EXISTS "status";

