import { z } from 'zod';

import { ApiError } from '../../utils/ApiError.js';
import { financialIdSchema, positiveAmountSchema } from '../finance/finance.schemas.js';

const id = prefix => z.string().max(255).regex(new RegExp(`^${prefix}_[A-Za-z0-9_]+$`));
const reference = prefix => z.union([id(prefix), z.object({ id: id(prefix) })]).transform(value => typeof value === 'string' ? value : value.id);
const seconds = z.number().int().positive().max(8_640_000_000_000);
const currency = z.string().regex(/^[a-z]{3}$/).transform(value => value.toUpperCase());
export const rawRefundSnapshotSchema = z.object({ object: z.literal('refund'), id: id('re'),
  payment_intent: reference('pi'), amount: positiveAmountSchema, currency, created: seconds,
  status: z.enum(['pending', 'requires_action', 'succeeded', 'failed', 'canceled']),
  metadata: z.preprocess(value => value ?? {}, z.object({ refundId: z.string().max(255).optional(),
    orderId: z.string().max(255).optional(), paymentId: z.string().max(255).optional() })).default({}),
});
const chargeSchema = z.object({ object: z.literal('charge'), id: id('ch'), payment_intent: reference('pi'),
  amount: positiveAmountSchema, amount_refunded: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  currency, livemode: z.literal(false) });
const disputeSchema = z.object({ object: z.literal('dispute'), id: id('du'), payment_intent: reference('pi').nullable(),
  charge: reference('ch'), amount: positiveAmountSchema, currency, livemode: z.literal(false),
  status: z.string().min(1).max(80).regex(/^[a-z_]+$/) });
export const financialEventTypes = Object.freeze(['refund.created', 'refund.updated', 'refund.failed', 'charge.refunded',
  'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed',
  'charge.dispute.funds_withdrawn', 'charge.dispute.funds_reinstated']);

export function refundCorrelation(metadata) {
  const values = [metadata.refundId, metadata.orderId, metadata.paymentId];
  const present = values.some(value => value != null && value !== '');
  const valid = present && values.every(value => financialIdSchema.safeParse(value).success);
  return { correlation: valid ? { refundId: metadata.refundId.toLowerCase(), orderId: metadata.orderId.toLowerCase(),
    paymentId: metadata.paymentId.toLowerCase() } : null, metadataConflict: present && !valid };
}
export function parseFinancialEvent(event) {
  try {
    if (event.type.startsWith('refund.')) {
      const r = rawRefundSnapshotSchema.parse(event.data.object);
      return { kind: 'refund', created: event.created, paymentIntentId: r.payment_intent, providerRefundId: r.id,
        amountMinor: r.amount, currency: r.currency, providerStatus: r.status, providerCreated: r.created,
        ...refundCorrelation(r.metadata) };
    }
    if (event.type === 'charge.refunded') {
      const c = chargeSchema.parse(event.data.object);
      return { kind: 'charge', created: event.created, chargeId: c.id, paymentIntentId: c.payment_intent,
        amountMinor: c.amount, refundedAmountMinor: c.amount_refunded, currency: c.currency };
    }
    const d = disputeSchema.parse(event.data.object);
    return { kind: 'dispute', created: event.created, disputeId: d.id, chargeId: d.charge,
      paymentIntentId: d.payment_intent, amountMinor: d.amount, currency: d.currency, providerStatus: d.status };
  } catch { throw new ApiError(400, 'INVALID_PAYMENT_EVENT', 'Invalid payment event'); }
}

const paymentEvidence = z.object({ id: id('pi'), amountMinor: positiveAmountSchema, amountReceivedMinor: positiveAmountSchema,
  currency: z.string().regex(/^[A-Z]{3}$/), orderId: financialIdSchema.nullable(), status: z.literal('succeeded'), livemode: z.literal(false) }).strict();
const correlation = z.object({ refundId: financialIdSchema, orderId: financialIdSchema, paymentId: financialIdSchema }).strict().nullable();
export const refundObservationSchema = z.object({ kind: z.literal('refund'), providerRefundId: id('re'), paymentIntentId: id('pi'),
  amountMinor: positiveAmountSchema, currency: z.string().regex(/^[A-Z]{3}$/),
  providerStatus: z.enum(['pending', 'requires_action', 'succeeded', 'failed', 'canceled']),
  providerCreatedAt: z.date(), correlation, metadataConflict: z.boolean(), payment: paymentEvidence }).strict();
export const safetyObservationSchema = z.object({ kind: z.enum(['charge', 'dispute']), paymentIntentId: id('pi'),
  resourceId: z.string().max(255), amountMinor: positiveAmountSchema, currency: z.string().regex(/^[A-Z]{3}$/),
  refundedAmountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  providerStatus: z.string().max(80).optional(), payment: paymentEvidence,
  refunds: z.array(refundObservationSchema).max(500).optional() }).strict().superRefine((value, context) => {
  if (value.kind === 'charge' && (value.refundedAmountMinor == null || !value.refunds || !/^ch_[A-Za-z0-9_]+$/.test(value.resourceId))) {
    context.addIssue({ code: 'custom', message: 'Charge evidence requires its complete refund scan and total' });
  }
  if (value.kind === 'dispute' && (!value.providerStatus || !/^du_[A-Za-z0-9_]+$/.test(value.resourceId))) {
    context.addIssue({ code: 'custom', message: 'Dispute evidence requires its provider status' });
  }
});
