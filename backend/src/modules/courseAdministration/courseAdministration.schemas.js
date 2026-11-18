import { z } from 'zod';

import { financialIdSchema, financialReasonSchema, revisionSchema } from '../finance/finance.schemas.js';
import { containsUnsafeCharacter } from '../../utils/textValidation.js';

const reason = z.string().refine(value => !containsUnsafeCharacter(value),
  'Control and formatting characters are not allowed').pipe(financialReasonSchema);
export const courseAdministrationParamsSchema = z.object({ courseId: financialIdSchema }).strict();
export const archiveCourseInputSchema = z.object({ reason, expectedRevision: revisionSchema }).strict();
export const courseAccessInputSchema = archiveCourseInputSchema.extend({
  accessStatus: z.enum(['available', 'blocked']),
}).strict();
export const emptyCoursePolicyQuerySchema = z.object({}).strict();
