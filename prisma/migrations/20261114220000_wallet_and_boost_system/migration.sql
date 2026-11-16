-- Step 1: Create CoinTransactionType enum safely
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CoinTransactionType') THEN
        CREATE TYPE "CoinTransactionType" AS ENUM ('WELCOME_BONUS', 'BOOST_SPENT', 'PURCHASE', 'REFUND');
    END IF;
END $$;

-- Step 2: Add CANCELLED value to AdStatus enum safely
ALTER TYPE "AdStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- Step 3: Add coinsBalance column to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "coinsBalance" INTEGER NOT NULL DEFAULT 0;

-- Step 4: Create CoinTransaction table
CREATE TABLE IF NOT EXISTS "CoinTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "type" "CoinTransactionType" NOT NULL,
    "reason" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CoinTransaction_idempotencyKey_key" ON "CoinTransaction"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "CoinTransaction_userId_createdAt_idx" ON "CoinTransaction"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "CoinTransaction_referenceType_referenceId_idx" ON "CoinTransaction"("referenceType", "referenceId");

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'CoinTransaction_userId_fkey' AND table_name = 'CoinTransaction'
    ) THEN
        ALTER TABLE "CoinTransaction" ADD CONSTRAINT "CoinTransaction_userId_fkey" 
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Step 5: Create BoostPackage table
CREATE TABLE IF NOT EXISTS "BoostPackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "coinsCost" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoostPackage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BoostPackage_isActive_sortOrder_idx" ON "BoostPackage"("isActive", "sortOrder");

-- Step 6: Seed initial active BoostPackages (idempotent with deterministic UUIDs)
INSERT INTO "BoostPackage" ("id", "name", "durationDays", "coinsCost", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES 
    ('b0057001-0000-4000-8000-000000000001', '1 Day Boost', 1, 50, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('b0057002-0000-4000-8000-000000000002', '3 Days Boost', 3, 120, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('b0057003-0000-4000-8000-000000000003', '7 Days Boost', 7, 200, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Step 7: Update Advertisement table columns and indexes
ALTER TABLE "Advertisement" ALTER COLUMN "title" SET DEFAULT 'Boost Campaign';
ALTER TABLE "Advertisement" ADD COLUMN IF NOT EXISTS "packageId" TEXT;
ALTER TABLE "Advertisement" ADD COLUMN IF NOT EXISTS "packageDays" INTEGER;
ALTER TABLE "Advertisement" ADD COLUMN IF NOT EXISTS "coinsSpent" INTEGER;

-- Foreign key for packageId
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'Advertisement_packageId_fkey' AND table_name = 'Advertisement'
    ) THEN
        ALTER TABLE "Advertisement" ADD CONSTRAINT "Advertisement_packageId_fkey" 
            FOREIGN KEY ("packageId") REFERENCES "BoostPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Advertisement_packageId_idx" ON "Advertisement"("packageId");
CREATE INDEX IF NOT EXISTS "Advertisement_status_endDate_idx" ON "Advertisement"("status", "endDate");

-- Step 8: Migrate existing STOPPED status rows to CANCELLED safely
UPDATE "Advertisement" SET "status" = 'CANCELLED' WHERE "status"::text = 'STOPPED';

-- Step 9: Partial Unique Index - prevent more than one ACTIVE boost per target
CREATE UNIQUE INDEX IF NOT EXISTS "Advertisement_active_target_unique" 
ON "Advertisement" ("targetType", "targetId") 
WHERE "status" = 'ACTIVE';
