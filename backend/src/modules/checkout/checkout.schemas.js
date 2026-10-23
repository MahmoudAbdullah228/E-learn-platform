import { z } from 'zod';

export const checkoutParamsSchema = z.object({
  courseId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid course id'),
}).strict();
export const checkoutBodySchema = z.object({}).strict().optional();
