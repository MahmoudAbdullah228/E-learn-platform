import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parsePaymentEvent } from '../src/modules/payments/payment.schemas.js';
import { createRefundOperationsService, refundOperationSchema } from '../src/modules/refunds/refundOperations.service.js';
import { createStripeRefundEvidenceAdapter } from '../src/services/stripeRefundEvidence.adapter.js';

const orderId = '1'.repeat(24);
const intent = () => ({ id: 'pi_test', amount: 1000, amount_received: 1000, currency: 'egp',
  status: 'succeeded', livemode: false, metadata: { orderId }, customer: 'private-customer' });
const raw = () => ({ object: 'refund', id: 're_test', payment_intent: 'pi_test', amount: 1000, currency: 'egp',
  created: 1795000000, status: 'succeeded', metadata: {}, receipt_number: 'private-receipt' });
const envelope = (object = raw(), type = 'refund.updated') => ({ id: 'evt_refund', type, created: 1795000001,
  livemode: false, data: { object }, api_version: 'ignored' });
function fixture() {
  const parent = intent(); const refund = raw(); const calls = [];
  const stripe = { paymentIntents: { async retrieve(...args) { calls.push(args); return parent; } },
    refunds: { async retrieve() { return refund; }, async list() { return { data: [refund], has_more: false }; } },
    charges: { async retrieve() { return { id: 'ch_test', amount: 1000, amount_refunded: 1000, currency: 'egp',
      livemode: false, payment_intent: 'pi_test' }; } } };
  return { parent, refund, stripe, calls, adapter: createStripeRefundEvidenceAdapter({ stripe, secretKey: 'sk_test_fixture', apiTimeoutMs: 1000 }) };
}
test('refund projections accept optional external metadata and retain no receipt/customer/provider payload', () => {
  const parsed = parsePaymentEvent(envelope()); assert.equal(parsed.ignored, false);
  assert.equal(parsed.payload.kind, 'refund'); assert.equal(parsed.payload.currency, 'EGP');
  assert.equal(parsed.payload.correlation, null); assert.equal(parsed.payload.metadataConflict, false);
  assert.equal(JSON.stringify(parsed).includes('private'), false);
  const partialMetadata = raw(); partialMetadata.metadata = { orderId };
  assert.equal(parsePaymentEvent(envelope(partialMetadata)).payload.metadataConflict, true);
});
test('financial event parsing rejects wrong mode/account, invalid IDs/status/amounts and preserves ignored unknown types', () => {
  for (const patch of [{ livemode: true }, { account: 'acct_other' }, { created: Infinity }]) {
    assert.throws(() => parsePaymentEvent({ ...envelope(), ...patch }), { code: 'INVALID_PAYMENT_EVENT' });
  }
  for (const patch of [{ amount: 1.2 }, { amount: -1 }, { id: 'bad' }, { payment_intent: null }, { status: 'unknown' }]) {
    assert.throws(() => parsePaymentEvent(envelope({ ...raw(), ...patch })), { code: 'INVALID_PAYMENT_EVENT' });
  }
  assert.equal(parsePaymentEvent(envelope({}, 'refund.reconciled')).ignored, true);
});
test('charge and dispute events normalize the minimal association and safety projection', () => {
  const charge = parsePaymentEvent(envelope({ object: 'charge', id: 'ch_test', payment_intent: { id: 'pi_test' },
    amount: 1000, amount_refunded: 200, currency: 'egp', livemode: false }, 'charge.refunded'));
  assert.equal(charge.payload.refundedAmountMinor, 200);
  const dispute = parsePaymentEvent(envelope({ object: 'dispute', id: 'du_test', charge: 'ch_test', payment_intent: null,
    amount: 1000, currency: 'egp', livemode: false, status: 'needs_response' }, 'charge.dispute.created'));
  assert.equal(dispute.payload.kind, 'dispute'); assert.equal(dispute.payload.paymentIntentId, null);
});
test('current refund adapter authenticates the Test parent and external identity without requiring local metadata', async () => {
  const f = fixture(); const result = await f.adapter.retrieveRefundObservation({ providerRefundId: 're_test', paymentIntentId: 'pi_test' });
  assert.equal(result.providerStatus, 'succeeded'); assert.equal(result.correlation, null);
  assert.equal(JSON.stringify(result).includes('private'), false); assert.equal(f.calls[0][2].maxNetworkRetries, 0);
  for (const patch of [{ livemode: true }, { id: 'pi_other' }, { amount_received: 0 }]) {
    const bad = fixture(); Object.assign(bad.parent, patch);
    await assert.rejects(bad.adapter.retrieveRefundObservation({ providerRefundId: 're_test', paymentIntentId: 'pi_test' }), { code: 'REFUND_EVIDENCE_MISMATCH' });
  }
});
test('refund scans are complete, bounded and reject repeated/incomplete pages instead of returning a truncated truth', async () => {
  for (const result of [{ data: [], has_more: true }, { data: [raw()], has_more: true }, { data: [], has_more: 'false' }]) {
    const f = fixture(); f.stripe.refunds.list = async () => result;
    await assert.rejects(f.adapter.scanRefundObservations({ paymentIntentId: 'pi_test' }), { code: 'REFUND_EVIDENCE_MISMATCH' });
  }
  const f = fixture(); let pages = 0;
  f.stripe.refunds.list = async () => ({ data: [{ ...raw(), id: `re_${++pages}` }], has_more: true });
  await assert.rejects(f.adapter.scanRefundObservations({ paymentIntentId: 'pi_test' }), { code: 'REFUND_EVIDENCE_MISMATCH' });
  assert.equal(pages, 5);
});
test('safety evidence retrieves a current charge and its bounded refund scan', async () => {
  const f = fixture(); const result = await f.adapter.retrieveFinancialSafetyObservation({ kind: 'charge', chargeId: 'ch_test', paymentIntentId: 'pi_test' });
  assert.equal(result.refundedAmountMinor, 1000); assert.equal(result.refunds.length, 1);
  assert.equal(result.payment.orderId, orderId);
});
test('refund evidence reads are cancellable between provider awaits and provider failures are sanitized', async () => {
  const f = fixture(); const controller = new AbortController(); let reads = 0;
  f.stripe.refunds.retrieve = async () => { controller.abort(); return raw(); };
  f.stripe.paymentIntents.retrieve = async () => { reads++; return intent(); };
  await assert.rejects(f.adapter.retrieveRefundObservation({ providerRefundId: 're_test', paymentIntentId: 'pi_test' },
    { signal: controller.signal }), { code: 'REFUND_PROVIDER_UNAVAILABLE' });
  assert.equal(reads, 0);
  const failed = fixture(); failed.stripe.refunds.retrieve = async () => { throw new Error('private key and customer data'); };
  await assert.rejects(failed.adapter.retrieveRefundObservation({ providerRefundId: 're_test', paymentIntentId: 'pi_test' }),
    error => error.code === 'REFUND_PROVIDER_UNAVAILABLE' && !error.message.includes('private'));
});
test('refund operations default to dry-run and execution permits only one read/reconciliation, never issuance', async () => {
  const calls = []; const operations = createRefundOperationsService({ worker: { async processNext(input) { calls.push(input); return true; } } });
  assert.deepEqual(await operations.run({ refundId: orderId }), { dryRun: true, observed: false }); assert.equal(calls.length, 0);
  assert.deepEqual(await operations.run({ refundId: orderId, execute: true }), { dryRun: false, observed: true });
  assert.deepEqual(calls, [{ refundId: orderId, allowIssue: false }]);
  for (const patch of [{ refundId: 'bad' }, { force: true }, { execute: 'true' }]) assert.equal(refundOperationSchema.safeParse({ refundId: orderId, ...patch }).success, false);
});
