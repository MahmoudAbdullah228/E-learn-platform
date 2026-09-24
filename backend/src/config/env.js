import { z } from 'zod';

const optionalTrimmedString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);

const optionalSecret = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

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
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must contain at least 32 characters'),
    JWT_ISSUER: z.string().trim().min(1).default('e-learning-platform-api'),
    JWT_AUDIENCE: z.string().trim().min(1).default('e-learning-platform-web'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().default(900)
      .refine((value) => value === 900, 'ACCESS_TOKEN_TTL_SECONDS must be 900'),
    REFRESH_TOKEN_PEPPER: z.string().min(32,
      'REFRESH_TOKEN_PEPPER must contain at least 32 characters'),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(3600).max(7_776_000)
      .default(2_592_000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
    EMAIL_PROVIDER: z.enum(['smtp', 'memory']).default('smtp'),
    EMAIL_FROM: z.string().trim().email().optional(),
    EMAIL_VERIFICATION_URL: z.string().trim().url().optional(),
    SMTP_HOST: z.string().trim().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SMTP_USER: optionalTrimmedString,
    SMTP_PASSWORD: optionalSecret,
    SMTP_CONNECTION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(120_000)
      .default(10_000),
    SMTP_GREETING_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(120_000)
      .default(10_000),
    SMTP_SOCKET_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(300_000)
      .default(30_000),
    REGISTER_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(5),
    VERIFY_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
    RESEND_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(5),
    LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
    REFRESH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(60),
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(86_400_000)
      .default(900_000),
  })
  .superRefine((values, context) => {
    if (values.NODE_ENV === 'test' && !values.MONGO_TEST_URI) {
      context.addIssue({
        code: 'custom',
        path: ['MONGO_TEST_URI'],
        message: 'MONGO_TEST_URI is required when NODE_ENV=test',
      });
    }

    if (values.EMAIL_PROVIDER === 'memory' && values.NODE_ENV !== 'test') {
      context.addIssue({
        code: 'custom',
        path: ['EMAIL_PROVIDER'],
        message: 'EMAIL_PROVIDER=memory is allowed only when NODE_ENV=test',
      });
    }

    if (!values.EMAIL_FROM) {
      context.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM'],
        message: 'EMAIL_FROM is required',
      });
    }

    if (!values.EMAIL_VERIFICATION_URL) {
      context.addIssue({
        code: 'custom',
        path: ['EMAIL_VERIFICATION_URL'],
        message: 'EMAIL_VERIFICATION_URL is required',
      });
    }

    if (values.EMAIL_PROVIDER === 'smtp' && !values.SMTP_HOST) {
      context.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required when EMAIL_PROVIDER=smtp',
      });
    }

    if (Boolean(values.SMTP_USER) !== Boolean(values.SMTP_PASSWORD)) {
      context.addIssue({
        code: 'custom',
        path: ['SMTP_PASSWORD'],
        message: 'SMTP_USER and SMTP_PASSWORD must be provided together',
      });
    }

    if (values.JWT_ACCESS_SECRET === values.REFRESH_TOKEN_PEPPER) {
      context.addIssue({
        code: 'custom',
        path: ['REFRESH_TOKEN_PEPPER'],
        message: 'REFRESH_TOKEN_PEPPER must be different from JWT_ACCESS_SECRET',
      });
    }

    if (values.NODE_ENV === 'production') {
      for (const [key, secret] of [
        ['JWT_ACCESS_SECRET', values.JWT_ACCESS_SECRET],
        ['REFRESH_TOKEN_PEPPER', values.REFRESH_TOKEN_PEPPER],
      ]) {
        if (/^(replace|example|change|test[-_])/i.test(secret)) {
          context.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} must be a strong deployment-specific value`,
          });
        }
      }
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

const verificationUrl = new URL(parsed.EMAIL_VERIFICATION_URL);
if (!['http:', 'https:'].includes(verificationUrl.protocol)) {
  throw new Error(
    'Invalid environment variables:\nEMAIL_VERIFICATION_URL: must use the HTTP or HTTPS protocol',
  );
}

if (parsed.NODE_ENV === 'production' && verificationUrl.protocol !== 'https:') {
  throw new Error(
    'Invalid environment variables:\nEMAIL_VERIFICATION_URL: HTTPS is required in production',
  );
}

export const env = Object.freeze({
  ...parsed,
  CORS_ORIGINS: corsOrigins,
  DATABASE_URI: parsed.NODE_ENV === 'test' ? parsed.MONGO_TEST_URI : parsed.MONGO_URI,
});
