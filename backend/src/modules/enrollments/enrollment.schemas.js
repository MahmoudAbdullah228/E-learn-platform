import { z } from 'zod';
import { paginationFields } from '../../utils/pagination.js';

export const courseParamsSchema = z.object({
  courseId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid course id'),
}).strict();
export const enrollBodySchema = z.object({}).strict().optional();
export const libraryQuerySchema = z.object({ ...paginationFields,
  status: z.enum(['active', 'revoked', 'all']).default('active'),
}).strict();
