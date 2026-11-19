import { z } from 'zod';

import { textSchema } from '../../utils/textValidation.js';

export const financialIdSchema = z.string().regex(/^[a-f\d]{24}$/i).toLowerCase();
export const currencySchema = z.literal('EGP');
export const signedAmountSchema = z.number().int().min(-Number.MAX_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);
export const amountSchema = signedAmountSchema.nonnegative();
export const positiveAmountSchema = amountSchema.positive();
export const revisionSchema = amountSchema;
export const financialKeySchema = z.string().min(16).max(128).regex(/^[A-Za-z0-9_.-]+$/);
export const financialReasonSchema = textSchema({ field: 'Reason', minimum: 10, maximum: 500 });
export const reasonCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/);
export const policyVersionSchema = z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9_.-]*$/);
export const fingerprintSchema = z.string().regex(/^[a-f\d]{64}$/);
export const refundWindowSchema = z.number().int().min(1).max(365 * 86400);
export const transferReferenceSchema = z.string().trim().toUpperCase().min(3).max(128)
  .regex(/^[A-Z0-9][A-Z0-9._/-]+$/);

export const deadlineInputSchema = z.object({
  paymentConfirmedAt: z.date(),
  refundWindowSeconds: refundWindowSchema,
}).strict();

export const financialPolicyInputSchema = z.object({
  version: policyVersionSchema, effectiveFrom: z.date(), refundWindowSeconds: refundWindowSchema,
  refundMode: z.literal('full'), lateAdminOverrideAllowed: z.boolean(),
  eligibilityRule: z.literal('after_refund_window_without_holds'),
  approvalSource: z.enum(['product_delegation', 'admin_approval']),
  approvedBy: financialIdSchema.nullable().default(null), approvedAt: z.date(),
  approvalReference: z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/),
}).strict().refine(value => value.approvedAt <= value.effectiveFrom
  && (value.approvalSource !== 'admin_approval' || value.approvedBy !== null),
'A policy requires ordered activation and complete approval provenance');

export const financialRangeSchema = z.object({ from: z.date(), to: z.date() }).strict()
  .refine(value => value.from < value.to && value.to - value.from <= 366 * 86400_000,
    'A positive range of at most 366 days is required');

const utc = z.iso.datetime().refine(value => !/\.\d{4,}Z$/.test(value), 'Use millisecond precision')
  .transform(value => new Date(value));
export const financialWindowFields = { from: utc.optional(), to: utc.optional(), currency: currencySchema.default('EGP') };
export const financialQueryRange = schema => schema.refine(({ from, to }) =>
  (!from && !to) || financialRangeSchema.safeParse({ from, to }).success,
{ path: ['to'], message: 'Supply both UTC bounds for a positive interval of at most 366 days' });

export const holdInputSchema = z.object({
  paymentId: financialIdSchema.nullable().default(null),
  sourceType: z.enum(['refund', 'payment', 'payout', 'dispute', 'legacy', 'operations']),
  sourceId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/),
  reasonCode: reasonCodeSchema,
  openedBy: financialIdSchema.nullable().default(null),
}).strict();

export const holdResolutionSchema = z.object({
  holdId: financialIdSchema,
  resolutionCode: reasonCodeSchema,
  resolvedBy: financialIdSchema.nullable().default(null),
}).strict();
