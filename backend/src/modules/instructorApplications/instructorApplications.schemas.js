import { z } from 'zod';
import { textSchema } from '../../utils/textValidation.js';

const pageSchema = z.string().regex(/^[1-9]\d*$/).default('1')
  .transform(Number)
  .pipe(z.number().int().min(1).max(1_000_000));

const limitSchema = z.string().regex(/^[1-9]\d*$/).default('20')
  .transform(Number)
  .pipe(z.number().int().min(1).max(100));

export const createInstructorApplicationSchema = z.object({
  bio: textSchema({ minimum: 50, maximum: 2000, field: 'Bio', multiline: true }),
  expertise: textSchema({ minimum: 2, maximum: 200, field: 'Expertise' }),
}).strict();

export const listInstructorApplicationsQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  page: pageSchema,
  limit: limitSchema,
}).strict();

export const applicationIdParamsSchema = z.object({
  applicationId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid application id'),
}).strict();

const approveApplicationSchema = z.object({
  status: z.literal('approved'),
}).strict();

const rejectApplicationSchema = z.object({
  status: z.literal('rejected'),
  rejectionReason: textSchema({
    minimum: 5, maximum: 500, field: 'Rejection reason', multiline: true,
  }),
}).strict();

export const reviewInstructorApplicationSchema = z.discriminatedUnion('status', [
  approveApplicationSchema,
  rejectApplicationSchema,
]);
