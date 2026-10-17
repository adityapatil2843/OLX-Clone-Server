import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .optional()
    .default('5000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().optional(),
  DIRECT_DATABASE_URL: z.string().optional(),
  CORS_ORIGIN: z.string().default('*'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  DEV_TEST_CREATOR_ID: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .optional()
    .default('900000')
    .transform((val) => parseInt(val, 10)),
  RATE_LIMIT_MAX: z
    .string()
    .optional()
    .default('300')
    .transform((val) => parseInt(val, 10)),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(`❌ Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }

  return Object.freeze(result.data);
};

export const env = parseEnv();
export default env;
