import { z } from 'zod';

import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { logger } from '../src/config/logger.js';
import { seedAdmin } from '../src/services/seed.service.js';

const adminEnvironmentSchema = z.object({
  ADMIN_NAME: z.string().trim().min(2).max(100),
  ADMIN_EMAIL: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  ADMIN_PASSWORD: z
    .string()
    .min(12, 'ADMIN_PASSWORD must contain at least 12 characters')
    .max(72)
    .refine((value) => value !== 'replace-with-a-strong-password', {
      message: 'ADMIN_PASSWORD must be changed from the example placeholder',
    })
    .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, {
      message: 'ADMIN_PASSWORD must not exceed 72 UTF-8 bytes',
    }),
});

const result = adminEnvironmentSchema.safeParse(process.env);

if (!result.success) {
  const issues = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid admin seed variables:\n${issues}`);
}

try {
  await connectDatabase();
  const { admin, created } = await seedAdmin({
    name: result.data.ADMIN_NAME,
    email: result.data.ADMIN_EMAIL,
    password: result.data.ADMIN_PASSWORD,
  });
  logger.info({ adminId: admin.id, created }, 'Admin account ensured');
} finally {
  await disconnectDatabase();
}
