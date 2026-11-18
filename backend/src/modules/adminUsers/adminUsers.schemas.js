import { z } from 'zod';

import { financialIdSchema, financialReasonSchema, revisionSchema } from '../finance/finance.schemas.js';
import { containsUnsafeCharacter, textSchema } from '../../utils/textValidation.js';

const safeTextInput = z.string().refine(value => !containsUnsafeCharacter(value),
  'Control and formatting characters are not allowed');

export const adminUsersQuerySchema = z.object({
  q: safeTextInput.pipe(textSchema({ field: 'Search', minimum: 1, maximum: 100 }))
    .transform(value => value.toLowerCase()).optional(),
  role: z.enum(['student', 'instructor', 'admin']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  cursor: z.string().max(1024).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/).optional(),
  limit: z.string().regex(/^[1-9]\d{0,2}$/).transform(Number)
    .pipe(z.number().int().min(1).max(100)).optional().default(20),
}).strict();

export const adminUserParamsSchema = z.object({ userId: financialIdSchema }).strict();
export const userStatusInputSchema = z.object({
  status: z.enum(['active', 'suspended']), reason: safeTextInput.pipe(financialReasonSchema),
  expectedRevision: revisionSchema,
}).strict();

export const adminActorSchema = z.object({
  userId: financialIdSchema, familyId: z.uuid(), tokenVersion: revisionSchema,
  roles: z.array(z.enum(['student', 'instructor', 'admin'])),
}).strict();
