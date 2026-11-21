import { z } from 'zod';

import { currencySchema, financialIdSchema } from '../finance/finance.schemas.js';

export const eligibilityClaimSchema = z.object({ entryId: financialIdSchema,
  leaseId: z.string().uuid() }).strict();
export const eligibilityOperationSchema = z.object({ entryId: financialIdSchema.optional(),
  execute: z.boolean().default(false) }).strict();
export const eligibilitySummarySchema = z.object({ instructorId: financialIdSchema,
  currency: currencySchema.default('EGP'), cutoffAt: z.date().optional() }).strict();
export const eligibilityWorkerOptionsSchema = z.object({ intervalMs: z.number().int().min(1000).max(3_600_000),
  batchSize: z.number().int().min(1).max(100), shutdownTimeoutMs: z.number().int().min(1).max(60_000) }).strict();
