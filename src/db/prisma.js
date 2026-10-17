import { env } from '../config/env.js';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = env.DATABASE_URL;

const adapter = new PrismaPg({ connectionString });
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
