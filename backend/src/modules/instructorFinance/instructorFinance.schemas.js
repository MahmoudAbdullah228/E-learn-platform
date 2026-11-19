import { z } from 'zod';

import { payoutStatuses } from '../../models/Payout.js';
import { currencySchema, financialIdSchema, financialRangeSchema } from '../finance/finance.schemas.js';

const utc = z.iso.datetime().refine(value => !/\.\d{4,}Z$/.test(value), 'Use millisecond precision')
  .transform(value => new Date(value));
const windowFields = { from: utc.optional(), to: utc.optional(), currency: currencySchema.default('EGP') };
const pageFields = {
  limit: z.string().regex(/^[1-9]\d{0,2}$/).transform(Number).pipe(z.number().int().max(100)).optional().default(20),
  cursor: z.string().max(1024).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/).optional(),
};
const hasValidWindow = ({ from, to }) => from || to ? financialRangeSchema.safeParse({ from, to }).success : true;
const range = schema => schema.refine(hasValidWindow,
  { path: ['to'], message: 'Supply both UTC bounds for a positive interval of at most 366 days' });

export const instructorSummaryQuery = range(z.strictObject(windowFields));
export const instructorSalesQuery = range(z.strictObject({ ...windowFields, ...pageFields,
  status: z.enum(['paid', 'refunded']).optional(), courseId: financialIdSchema.optional(),
}));
export const instructorEarningsQuery = range(z.strictObject({ ...windowFields, ...pageFields,
  status: z.enum(['pending', 'eligible', 'included_in_payout', 'reversed']).optional(),
  type: z.enum(['sale', 'refund_adjustment']).optional(),
}));
export const instructorPayoutsQuery = range(z.strictObject({ ...windowFields, ...pageFields,
  status: z.enum(payoutStatuses).optional(),
}));
export const instructorPayoutParams = z.strictObject({ payoutId: financialIdSchema });
export const instructorPayoutDetailQuery = z.strictObject({});
