import { ApiError } from '../utils/ApiError.js';
import { financialIdSchema } from '../modules/finance/finance.schemas.js';
import { rawRefundSnapshotSchema, refundCorrelation, refundObservationSchema, safetyObservationSchema } from '../modules/refunds/refundEvent.schemas.js';

const mismatch = () => new ApiError(409, 'REFUND_EVIDENCE_MISMATCH', 'Refund evidence requires reconciliation');
const unavailable = () => new ApiError(503, 'REFUND_PROVIDER_UNAVAILABLE', 'Refund processing is temporarily unavailable');
const providerId = (value, prefix) => typeof value === 'string' && value.length <= 255 && new RegExp(`^${prefix}_[A-Za-z0-9_]+$`).test(value);
const referenceId = value => typeof value === 'string' ? value : value?.id;

export function createStripeRefundEvidenceAdapter({ stripe, secretKey, apiTimeoutMs }) {
  const options = () => ({ timeout: apiTimeoutMs, maxNetworkRetries: 0 });
  async function execute(work, signal) {
    if (!stripe || !secretKey?.startsWith('sk_test_')) throw unavailable();
    try { signal?.throwIfAborted(); const result = await work(); signal?.throwIfAborted(); return result; }
    catch (error) { if (error?.code === 'REFUND_EVIDENCE_MISMATCH') throw error; throw unavailable(); }
  }
  async function payment(paymentIntentId, signal) {
    if (!providerId(paymentIntentId, 'pi')) throw mismatch();
    signal?.throwIfAborted();
    const p = await stripe.paymentIntents.retrieve(paymentIntentId, {}, options());
    signal?.throwIfAborted();
    if (p?.id !== paymentIntentId || p.livemode !== false || p.status !== 'succeeded'
        || !Number.isSafeInteger(p.amount) || p.amount <= 0 || !Number.isSafeInteger(p.amount_received)
        || p.amount_received <= 0 || !/^[a-z]{3}$/.test(p.currency ?? '')) throw mismatch();
    return { id: p.id, amountMinor: p.amount, amountReceivedMinor: p.amount_received, currency: p.currency.toUpperCase(),
      orderId: financialIdSchema.safeParse(p.metadata?.orderId).success ? p.metadata.orderId.toLowerCase() : null,
      status: p.status, livemode: false };
  }
  function normalize(raw, parent) {
    const parsed = rawRefundSnapshotSchema.safeParse(raw);
    if (!parsed.success || parsed.data.payment_intent !== parent.id) throw mismatch();
    const r = parsed.data;
    return refundObservationSchema.parse({ kind: 'refund', providerRefundId: r.id, paymentIntentId: r.payment_intent,
      amountMinor: r.amount, currency: r.currency, providerStatus: r.status, providerCreatedAt: new Date(r.created * 1000),
      payment: parent, ...refundCorrelation(r.metadata) });
  }
  async function scan(paymentIntentId, signal, parent) {
    parent ??= await payment(paymentIntentId, signal);
    const rows = []; const seen = new Set(); let after;
    for (let page = 0; page < 5; page++) {
      signal?.throwIfAborted();
      const result = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100,
        ...(after ? { starting_after: after } : {}) }, options());
      signal?.throwIfAborted();
      if (!Array.isArray(result?.data) || result.data.length > 100 || typeof result.has_more !== 'boolean') throw mismatch();
      for (const raw of result.data) {
        const row = normalize(raw, parent);
        if (seen.has(row.providerRefundId)) throw mismatch();
        seen.add(row.providerRefundId); rows.push(row);
      }
      if (!result.has_more) return rows;
      after = result.data.at(-1)?.id; if (!after) throw mismatch();
    }
    throw mismatch();
  }
  return Object.freeze({
    retrieveRefundObservation({ providerRefundId, paymentIntentId }, { signal } = {}) {
      return execute(async () => {
        if (!providerId(providerRefundId, 're')) throw mismatch();
        const raw = await stripe.refunds.retrieve(providerRefundId, {}, options()); signal?.throwIfAborted();
        if (raw?.id !== providerRefundId || referenceId(raw.payment_intent) !== paymentIntentId) throw mismatch();
        return normalize(raw, await payment(paymentIntentId, signal));
      }, signal);
    },
    scanRefundObservations({ paymentIntentId }, { signal } = {}) {
      return execute(() => scan(paymentIntentId, signal), signal);
    },
    retrieveFinancialSafetyObservation(payload, { signal } = {}) {
      return execute(async () => {
        let resource;
        if (payload.kind === 'dispute') {
          if (!providerId(payload.disputeId, 'du')) throw mismatch();
          resource = await stripe.disputes.retrieve(payload.disputeId, { expand: ['charge'] }, options());
        } else {
          if (!providerId(payload.chargeId, 'ch')) throw mismatch();
          resource = await stripe.charges.retrieve(payload.chargeId, {}, options());
        }
        signal?.throwIfAborted();
        if (resource?.id !== (payload.kind === 'dispute' ? payload.disputeId : payload.chargeId)
            || resource.livemode !== false || !Number.isSafeInteger(resource.amount) || resource.amount <= 0
            || !/^[a-z]{3}$/.test(resource.currency ?? '')) throw mismatch();
        let pi = referenceId(resource.payment_intent);
        if (!pi && payload.kind === 'dispute') {
          let charge = resource.charge;
          if (typeof charge === 'string') charge = await stripe.charges.retrieve(charge, {}, options());
          signal?.throwIfAborted();
          if (!charge || charge.livemode !== false || charge.id !== payload.chargeId) throw mismatch();
          pi = referenceId(charge.payment_intent);
        }
        if (payload.paymentIntentId && pi !== payload.paymentIntentId) throw mismatch();
        const parent = await payment(pi, signal);
        return safetyObservationSchema.parse({ kind: payload.kind, resourceId: resource.id, paymentIntentId: pi,
          amountMinor: resource.amount, currency: resource.currency.toUpperCase(), payment: parent,
          ...(payload.kind === 'charge' ? { refundedAmountMinor: resource.amount_refunded,
            refunds: await scan(pi, signal, parent) } : { providerStatus: resource.status }) });
      }, signal);
    },
  });
}
