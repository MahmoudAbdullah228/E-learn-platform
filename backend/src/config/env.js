import { z } from 'zod';

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    MONGO_URI: z.preprocess(
      (value) => value ?? '',
      z.string().trim().min(1, 'MONGO_URI is required'),
    ),
    MONGO_TEST_URI: z.string().trim().optional(),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  })
  .superRefine((values, context) => {
    if (values.NODE_ENV === 'test' && !values.MONGO_TEST_URI) {
      context.addIssue({
        code: 'custom',
        path: ['MONGO_TEST_URI'],
        message: 'MONGO_TEST_URI is required when NODE_ENV=test',
      });
    }
  });

const result = environmentSchema.safeParse(process.env);

if (!result.success) {
  const issues = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  throw new Error(`Invalid environment variables:\n${issues}`);
}

const parsed = result.data;
const corsOrigins = parsed.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (corsOrigins.length === 0) {
  throw new Error('Invalid environment variables:\nCORS_ORIGINS: at least one origin is required');
}

for (const origin of corsOrigins) {
  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new Error(`Invalid environment variables:\nCORS_ORIGINS: ${origin} is not a valid URL`);
  }

  if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.origin !== origin) {
    throw new Error(
      `Invalid environment variables:\nCORS_ORIGINS: ${origin} must be an HTTP(S) origin without a path`,
    );
  }
}

export const env = Object.freeze({
  ...parsed,
  CORS_ORIGINS: corsOrigins,
  DATABASE_URI: parsed.NODE_ENV === 'test' ? parsed.MONGO_TEST_URI : parsed.MONGO_URI,
});
