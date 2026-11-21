import { z } from 'zod';

import { ApiError } from '../utils/ApiError.js';
import { providerRefundRequestSchema, providerRefundReadSchema, providerRefundEvidenceSchema } from '../modules/refunds/refund.schemas.js';

const mismatch = () => new ApiError(409, 'REFUND_EVIDENCE_MISMATCH', 'Refund evidence requires reconciliation');
const unavailable = () => new ApiError(503, 'REFUND_PROVIDER_UNAVAILABLE', 'Refund processing is temporarily unavailable');
const rawRefundSchema = z.object({ id: z.string().max(255).regex(/^re_[A-Za-z0-9_]+$/),
  object: z.literal('refund'), amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), currency: z.literal('egp'),
  created: z.number().int().positive().max(8_640_000_000_000),
  payment_intent: z.union([z.string(), z.object({ id: z.string() })]),
  status: z.enum(['pending', 'requires_action', 'succeeded', 'failed', 'canceled']),
  metadata: z.object({ refundId: z.string(), orderId: z.string(), paymentId: z.string() }),
});

export function createStripeRefundAdapter({ stripe, secretKey, apiTimeoutMs, refundIssuanceEnabled }) {
  function assertConfigured() {
    if (!secretKey?.startsWith('sk_test_') || !stripe?.refunds || !stripe?.paymentIntents) throw unavailable();
  }
  function assertRefundReady() {
    assertConfigured();
    if (!refundIssuanceEnabled) throw new ApiError(503, 'REFUND_PROCESSING_NOT_ENABLED',
      'Refund processing has not been enabled');
  }
  async function verifyPayment(input, admission, signal) {
    signal?.throwIfAborted();
    const intent = await stripe.paymentIntents.retrieve(input.paymentIntentId, { expand: ['latest_charge'] },
      { timeout: apiTimeoutMs, maxNetworkRetries: 0 });
    signal?.throwIfAborted();
    if (!intent || intent.id !== input.paymentIntentId || intent.livemode !== false || intent.status !== 'succeeded'
        || intent.amount !== input.amountMinor || intent.amount_received !== input.amountMinor
        || intent.currency !== 'egp' || intent.metadata?.orderId !== input.orderId) throw mismatch();
    if (admission) {
      const charge = intent.latest_charge;
      if (!charge || typeof charge !== 'object' || charge.livemode !== false || charge.paid !== true
          || charge.captured !== true || charge.disputed !== false || charge.amount_refunded !== 0
          || charge.amount !== input.amountMinor || charge.currency !== 'egp'
          || (typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id) !== intent.id) {
        throw mismatch();
      }
    }
  }
  async function assertNoPriorRefund(input, signal) {
    const seen = new Set(); let after;
    for (let page = 0; page < 5; page++) {
      signal?.throwIfAborted();
      const result = await stripe.refunds.list({ payment_intent: input.paymentIntentId, limit: 100,
        ...(after ? { starting_after: after } : {}) }, { timeout: apiTimeoutMs, maxNetworkRetries: 0 });
      signal?.throwIfAborted();
      if (!Array.isArray(result?.data) || typeof result.has_more !== 'boolean') throw mismatch();
      for (const refund of result.data) {
        const intentId = typeof refund?.payment_intent === 'string' ? refund.payment_intent : refund?.payment_intent?.id;
        if (typeof refund?.id !== 'string' || !/^re_[A-Za-z0-9_]+$/.test(refund.id) || seen.has(refund.id)
            || intentId !== input.paymentIntentId || !['failed', 'canceled'].includes(refund.status)) throw mismatch();
        seen.add(refund.id);
      }
      if (!result.has_more) return;
      after = result.data.at(-1)?.id;
      if (!after) throw mismatch();
    }
    throw mismatch(); // Never infer absence from a truncated provider scan.
  }
  function normalize(raw, input) {
    const result = rawRefundSchema.safeParse(raw);
    if (!result.success) throw mismatch();
    const refund = result.data;
    if ((typeof refund.payment_intent === 'string' ? refund.payment_intent : refund.payment_intent.id) !== input.paymentIntentId
        || refund.amount !== input.amountMinor || refund.metadata.refundId !== input.refundId
        || refund.metadata.orderId !== input.orderId || refund.metadata.paymentId !== input.paymentId
        || (input.providerRefundId && refund.id !== input.providerRefundId)) throw mismatch();
    return providerRefundEvidenceSchema.parse({ refundId: input.refundId, orderId: input.orderId, paymentId: input.paymentId,
      paymentIntentId: input.paymentIntentId, amountMinor: refund.amount, currency: 'EGP', providerRefundId: refund.id,
      status: refund.status, createdAt: new Date(refund.created * 1000), livemode: false });
  }
  async function execute(input, create, signal) {
    if (create) assertRefundReady(); else assertConfigured();
    input = (create ? providerRefundRequestSchema : providerRefundReadSchema).parse(input);
    try {
      await verifyPayment(input, create, signal);
      if (create) await assertNoPriorRefund(input, signal);
      signal?.throwIfAborted();
      const raw = create ? await stripe.refunds.create({ payment_intent: input.paymentIntentId, amount: input.amountMinor,
        metadata: { refundId: input.refundId, orderId: input.orderId, paymentId: input.paymentId } },
      { idempotencyKey: input.providerIdempotencyKey, maxNetworkRetries: 0, timeout: apiTimeoutMs })
        : await stripe.refunds.retrieve(input.providerRefundId, {}, { maxNetworkRetries: 0, timeout: apiTimeoutMs });
      signal?.throwIfAborted();
      return normalize(raw, input);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'REFUND_EVIDENCE_MISMATCH') throw error;
      throw unavailable();
    }
  }
  return Object.freeze({ assertRefundReady, createRefund: (input, { signal } = {}) => execute(input, true, signal),
    retrieveRefund: (input, { signal } = {}) => execute(input, false, signal) });
}
