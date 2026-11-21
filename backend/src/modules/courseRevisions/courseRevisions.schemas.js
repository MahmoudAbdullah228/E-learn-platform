import { z } from 'zod';

import { courseFields } from '../courses/courses.schemas.js';
import { financialIdSchema as id, revisionSchema } from '../finance/finance.schemas.js';

export const empty = z.object({}).strict();
export const guard = z.object({ expectedRevision: revisionSchema }).strict();
export const versioned = schema => z.object({ expectedRevision: revisionSchema, ...schema.shape }).strict();
export const metadata = z.object(courseFields).partial().extend(guard.shape).strict()
  .refine(value => Object.keys(value).length > 1);
export const params = z.object({ courseId: id, revisionId: id, sectionId: id.optional(), lessonId: id.optional(), assetId: id.optional() }).strict();

export const mediaIntent = guard.extend({ purpose: z.enum(['course_cover', 'lesson_attachment']), targetId: id });
export const page = z.object({ after: z.string().regex(/^\d{1,10}$/).transform(Number).optional() }).strict();
