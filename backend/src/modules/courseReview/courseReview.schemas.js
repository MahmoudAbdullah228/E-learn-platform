import { z } from 'zod';

import { textSchema } from '../../utils/textValidation.js';

const page = z.string().regex(/^[1-9]\d*$/).default('1').transform(Number)
  .pipe(z.number().int().min(1).max(1_000_000));
const limit = z.string().regex(/^[1-9]\d*$/).default('20').transform(Number)
  .pipe(z.number().int().min(1).max(100));

export const reviewCourseParamsSchema = z.object({
  courseId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid course id'),
}).strict();

export const emptyReviewBodySchema = z.object({}).strict().optional();

export const adminCourseListQuerySchema = z.object({
  status: z.enum(['draft', 'pending_review', 'published', 'rejected', 'unavailable'])
    .default('pending_review'),
  page,
  limit,
}).strict();

export const reviewDecisionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve') }).strict(),
  z.object({
    decision: z.literal('reject'),
    reason: textSchema({ field: 'Rejection reason', minimum: 5, maximum: 500,
      multiline: true }),
  }).strict(),
]);
