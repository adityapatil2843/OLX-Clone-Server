import { env } from '../config/env.js';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString = env.DATABASE_URL;

const pool = new pg.Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('⚠️ Unexpected idle PostgreSQL client error:', err.message);
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export const connectPrisma = async () => {
  try {
    const result = await prisma.$queryRaw`SELECT NOW() as now`;
    console.log('✅ Supabase connected via Prisma successfully at:', result[0]?.now);
    return true;
  } catch (error) {
    console.error('❌ Supabase Prisma connection failed:', error.message);
    throw error;
  }
};

export { prisma };
export default prisma;
