import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/db/prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const migrationName = '20261114220000_wallet_and_boost_system';
  const migrationPath = path.join(__dirname, '..', 'prisma', 'migrations', migrationName, 'migration.sql');

  console.log(`Reading migration from: ${migrationPath}`);
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const checksum = crypto.createHash('sha256').update(sql).digest('hex');

  console.log(`Executing migration: ${migrationName}...`);
  const startedAt = new Date();

  // Step 2 must be committed first because PostgreSQL 55P04 prevents using new enum value in same transaction
  await prisma.$executeRawUnsafe(`ALTER TYPE "AdStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';`);

  // Execute the rest of the SQL migration
  await prisma.$executeRawUnsafe(sql);
  const finishedAt = new Date();

  console.log('SQL executed successfully! Recording into _prisma_migrations...');
  await prisma.$executeRawUnsafe(
    `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "logs", "rolled_back_at", "started_at", "finished_at", "applied_steps_count")
     VALUES ($1, $2, $3, $4, NULL, $5, $6, 1)
     ON CONFLICT ("id") DO NOTHING`,
    crypto.randomUUID(),
    checksum,
    migrationName,
    null,
    startedAt,
    finishedAt
  );

  console.log(`Migration ${migrationName} successfully recorded and applied!`);
  await prisma.$disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
