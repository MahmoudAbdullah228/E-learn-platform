import { z } from 'zod';

import { financialIdSchema, financialReasonSchema, revisionSchema } from '../finance/finance.schemas.js';
import { containsUnsafeCharacter } from '../../utils/textValidation.js';

import { courseFields } from '../courses/courses.schemas.js';

const correctionText = z.object({ title: courseFields.title.optional(), shortDescription: courseFields.shortDescription.optional() });
const reason = z.string().refine(value => !containsUnsafeCharacter(value),
  'Control and formatting characters are not allowed').pipe(financialReasonSchema);
export const courseAdministrationParamsSchema = z.object({ courseId: financialIdSchema }).strict();
export const archiveCourseInputSchema = z.object({ reason, expectedRevision: revisionSchema }).strict();
export const correctionInputSchema = archiveCourseInputSchema.extend(correctionText.shape)
  .refine(value => value.title !== undefined || value.shortDescription !== undefined,
    { message: 'Supply a title or short description' });
export const courseAccessInputSchema = archiveCourseInputSchema.extend({
  accessStatus: z.enum(['available', 'blocked']),
}).strict();
export const emptyCoursePolicyQuerySchema = z.object({}).strict();
