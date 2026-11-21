import { z } from 'zod';

import { financialIdSchema, revisionSchema } from '../modules/finance/finance.schemas.js';

export const adminActorSchema = z.object({
  userId: financialIdSchema, familyId: z.uuid(), tokenVersion: revisionSchema,
  roles: z.array(z.enum(['student', 'instructor', 'admin'])),
}).strict();
