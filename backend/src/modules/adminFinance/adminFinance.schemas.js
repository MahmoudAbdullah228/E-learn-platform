import { z } from 'zod';

import { financialIdSchema, financialQueryRange, financialWindowFields } from '../finance/finance.schemas.js';

export const adminDashboardQuery = financialQueryRange(z.strictObject(financialWindowFields));
export const adminFinanceSummaryQuery = financialQueryRange(z.strictObject({ ...financialWindowFields,
  instructorId: financialIdSchema.optional(),
}));
