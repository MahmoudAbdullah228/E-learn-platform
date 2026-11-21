import { z } from 'zod';

import { payoutStatuses } from '../../models/Payout.js';
import { financialIdSchema, financialQueryRange, financialWindowFields } from '../finance/finance.schemas.js';
const pageFields = {
  limit: z.string().regex(/^[1-9]\d{0,2}$/).transform(Number).pipe(z.number().int().max(100)).optional().default(20),
  cursor: z.string().max(1024).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/).optional(),
};
export const instructorSummaryQuery = financialQueryRange(z.strictObject(financialWindowFields));
export const instructorSalesQuery = financialQueryRange(z.strictObject({ ...financialWindowFields, ...pageFields,
  status: z.enum(['paid', 'refunded']).optional(), courseId: financialIdSchema.optional(),
}));
export const instructorEarningsQuery = financialQueryRange(z.strictObject({ ...financialWindowFields, ...pageFields,
  status: z.enum(['pending', 'eligible', 'included_in_payout', 'reversed']).optional(),
  type: z.enum(['sale', 'refund_adjustment']).optional(),
}));
export const instructorPayoutsQuery = financialQueryRange(z.strictObject({ ...financialWindowFields, ...pageFields,
  status: z.enum(payoutStatuses).optional(),
}));
export const instructorPayoutParams = z.strictObject({ payoutId: financialIdSchema });
export const instructorPayoutDetailQuery = z.strictObject({});
