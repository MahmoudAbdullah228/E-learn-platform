import { z } from 'zod';

import { financialIdSchema, financialKeySchema, financialReasonSchema, positiveAmountSchema } from '../finance/finance.schemas.js';
import { containsUnsafeCharacter } from '../../utils/textValidation.js';

export const refundOrderParamsSchema = z.object({ orderId: financialIdSchema }).strict();
export const refundIdParamsSchema = z.object({ refundId: financialIdSchema }).strict();
export const refundKeySchema = z.object({ idempotencyKey: financialKeySchema }).strict();
export const createRefundInputSchema = z.object({
  reason: z.string().refine(value => !containsUnsafeCharacter(value),
    'Control and formatting characters are not allowed').pipe(financialReasonSchema),
  overrideWindow: z.boolean().default(false),
}).strict();
export const emptyRefundQuerySchema = z.object({}).strict();
export const refundListQuerySchema = z.object({
  status: z.enum(['requested', 'processing', 'pending', 'requires_reconciliation', 'succeeded', 'failed', 'cancelled']).optional(),
  orderId: financialIdSchema.optional(),
  cursor: z.string().max(1024).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/).optional(),
  limit: z.string().regex(/^[1-9]\d{0,2}$/).transform(Number).pipe(z.number().int().min(1).max(100))
    .optional().default(20),
}).strict();

export const providerRefundIdentitySchema = z.object({
  refundId: financialIdSchema, orderId: financialIdSchema, paymentId: financialIdSchema,
  paymentIntentId: z.string().max(255).regex(/^pi_[A-Za-z0-9_]+$/),
  amountMinor: positiveAmountSchema, currency: z.literal('EGP'),
}).strict();
export const providerRefundRequestSchema = providerRefundIdentitySchema.extend({
  providerIdempotencyKey: z.string().regex(/^refund_[a-f\d-]{36}$/),
}).strict();
export const providerRefundReadSchema = providerRefundIdentitySchema.extend({
  providerRefundId: z.string().max(255).regex(/^re_[A-Za-z0-9_]+$/),
}).strict();
export const providerRefundEvidenceSchema = providerRefundIdentitySchema.extend({
  providerRefundId: z.string().max(255).regex(/^re_[A-Za-z0-9_]+$/),
  status: z.enum(['pending', 'requires_action', 'succeeded', 'failed', 'canceled']),
  createdAt: z.date(), livemode: z.literal(false),
}).strict();
