import { z } from 'zod';
import { paginationFields } from '../../utils/pagination.js';

export const orderParamsSchema = z.object({
  orderId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid order id'),
}).strict();
const status = z.enum(['pending', 'paid', 'failed', 'cancelled', 'refunded']).optional();
export const orderQuerySchema = z.object({ ...paginationFields, status }).strict();
export const adminOrderQuerySchema = z.object({ ...paginationFields, status,
  studentId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid student id').optional(),
  courseId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid course id').optional(),
}).strict();
