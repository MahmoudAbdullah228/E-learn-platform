import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { createStripePaymentProvider } from '../src/services/stripePayment.service.js';
import { createRefundInputSchema, refundListQuerySchema, refundKeySchema } from '../src/modules/refunds/refund.schemas.js';
import { assertRefundAdmission } from '../src/modules/refunds/refund.policy.js';
import { toAcceptedRefund, toRefund } from '../src/modules/refunds/refund.presenter.js';

const id = digit => digit.repeat(24);
const reason = 'A documented refund requested by the customer';
const now = new Date('2026-11-18T12:00:00Z');
const input = { refundId: id('1'), orderId: id('2'), paymentId: id('3'), paymentIntentId: 'pi_fixture',
  amountMinor: 1000, currency: 'EGP', providerIdempotencyKey: `refund_${randomUUID()}` };
function adapterFixture() {
  const calls = [];
  const intent = { id: input.paymentIntentId, livemode: false, status: 'succeeded', amount: 1000, amount_received: 1000,
    currency: 'egp', metadata: { orderId: input.orderId }, latest_charge: { id: 'ch_fixture', livemode: false,
      paid: true, captured: true, disputed: false, amount_refunded: 0, amount: 1000, currency: 'egp', payment_intent: input.paymentIntentId } };
  const refund = { id: 're_fixture', object: 'refund', amount: 1000, currency: 'egp',
    payment_intent: input.paymentIntentId, status: 'pending', created: Math.floor(now.getTime() / 1000),
    metadata: { refundId: input.refundId, orderId: input.orderId, paymentId: input.paymentId }, customer_email: 'private@example.test' };
  const client = { paymentIntents: { async retrieve(...args) { calls.push(['intent', ...args]); return intent; } },
    refunds: { async create(...args) { calls.push(['create', ...args]); return refund; },
      async list(...args) { calls.push(['list', ...args]); return { data: [], has_more: false }; },
      async retrieve(...args) { calls.push(['read', ...args]); return refund; } } };
  const provider = createStripePaymentProvider({ stripeClient: client, secretKey: 'sk_test_fixture', apiTimeoutMs: 1000,
    refundIssuanceEnabled: true });
  return { provider, intent, refund, calls, client };
}
test('refund requests and list/key inputs are strict, bounded and reject coercion or privileged monetary fields', () => {
  assert.deepEqual(createRefundInputSchema.parse({ reason }), { reason, overrideWindow: false });
  for (const patch of [{ amountMinor: 1 }, { currency: 'USD' }, { status: 'succeeded' }, { initiatedBy: id('4') },
    { overrideWindow: 'true' }, { reason: 'short' }, { reason: `${reason}\n` }, { reason: `${reason}\u200B` }]) {
    assert.equal(createRefundInputSchema.safeParse({ reason, ...patch }).success, false);
  }
  assert.deepEqual(refundListQuerySchema.parse({}), { limit: 20 });
  for (const query of [{ limit: '101' }, { limit: ['2'] }, { status: 'refunded' }, { orderId: 'bad' }, { page: '1' }]) {
    assert.equal(refundListQuerySchema.safeParse(query).success, false);
  }
  assert.equal(refundKeySchema.safeParse({ idempotencyKey: randomUUID() }).success, true);
  for (const value of [undefined, '', 'short', 'a'.repeat(129), 'key contains spaces']) {
    assert.equal(refundKeySchema.safeParse({ idempotencyKey: value }).success, false);
  }
});

test('Stripe refund adapter validates Test payment ownership and sends only immutable full amount/server correlation metadata', async () => {
  const f = adapterFixture();
  const result = await f.provider.createRefund(input);
  assert.equal(result.livemode, false); assert.equal(result.providerRefundId, 're_fixture');
  assert.equal(JSON.stringify(result).includes('private@example.test'), false);
  assert.deepEqual(f.calls[2], ['create', { payment_intent: 'pi_fixture', amount: 1000,
    metadata: { refundId: input.refundId, orderId: input.orderId, paymentId: input.paymentId } },
  { idempotencyKey: input.providerIdempotencyKey, maxNetworkRetries: 0, timeout: 1000 }]);
  assert.deepEqual(f.calls[0][2], { expand: ['latest_charge'] });
  assert.equal(f.calls[0][3].maxNetworkRetries, 0);
});

test('provider refund history scan rejects active/external refunds and incomplete or repeated pages before POST', async () => {
  for (const response of [{ data: [{ id: 're_partial', payment_intent: 'pi_fixture', status: 'pending' }], has_more: false },
    { data: [], has_more: true }, { data: [], has_more: 'false' },
    { data: [{ id: 're_failed', payment_intent: 'pi_fixture', status: 'failed' }], has_more: true }]) {
    const f = adapterFixture(); f.client.refunds.list = async () => response;
    await assert.rejects(f.provider.createRefund(input), { code: 'REFUND_EVIDENCE_MISMATCH' });
    assert.equal(f.calls.some(call => call[0] === 'create'), false);
  }
});

test('cancellation during preflight prevents a later refund POST when an outstanding SDK read returns', async () => {
  const f = adapterFixture(); const controller = new AbortController();
  let finish; let started;
  const waiting = new Promise(resolve => { started = resolve; });
  f.client.paymentIntents.retrieve = async () => { started(); return new Promise(resolve => { finish = resolve; }); };
  const operation = f.provider.createRefund(input, { signal: controller.signal });
  await waiting; controller.abort(); finish(f.intent);
  await assert.rejects(operation, { code: 'REFUND_PROVIDER_UNAVAILABLE' });
  assert.equal(f.calls.some(call => call[0] === 'create'), false);
});

test('Stripe preflight rejects live/mismatched/partially-refunded/disputed payments before any refund POST', async () => {
  for (const mutate of [f => { f.intent.livemode = true; }, f => { f.intent.metadata.orderId = id('9'); },
    f => { f.intent.amount_received = 999; }, f => { f.intent.currency = 'usd'; },
    f => { f.intent.latest_charge.amount_refunded = 1; }, f => { f.intent.latest_charge.disputed = true; },
    f => { f.intent.latest_charge = 'ch_unexpanded'; }]) {
    const f = adapterFixture(); mutate(f);
    await assert.rejects(f.provider.createRefund(input), { code: 'REFUND_EVIDENCE_MISMATCH' });
    assert.equal(f.calls.some(call => call[0] === 'create'), false);
  }
});

test('Stripe adapter accepts each normalized refund state and rejects mismatched amount/currency/IDs or unsafe provider data', async () => {
  for (const status of ['pending', 'requires_action', 'succeeded', 'failed', 'canceled']) {
    const f = adapterFixture(); f.refund.status = status;
    assert.equal((await f.provider.createRefund(input)).status, status);
  }
  for (const mutate of [f => { f.refund.amount = 1; }, f => { f.refund.currency = 'usd'; },
    f => { f.refund.metadata.refundId = id('9'); }, f => { f.refund.payment_intent = 'pi_other'; },
    f => { f.refund.created = Number.MAX_SAFE_INTEGER; }, f => { f.refund.status = 'unknown'; }]) {
    const f = adapterFixture(); mutate(f);
    await assert.rejects(f.provider.createRefund(input), { code: 'REFUND_EVIDENCE_MISMATCH' });
  }
});

test('Stripe retrieval verifies the stored association and does not treat an existing refund as a new-admission failure', async () => {
  const f = adapterFixture(); f.intent.latest_charge.amount_refunded = 1000;
  const { providerIdempotencyKey: unused, ...identity } = input; void unused;
  const result = await f.provider.retrieveRefund({ ...identity, providerRefundId: 're_fixture' });
  assert.equal(result.providerRefundId, 're_fixture');
  assert.equal(f.calls.some(call => call[0] === 'create'), false);
  f.refund.id = 're_other';
  await assert.rejects(f.provider.retrieveRefund({ ...identity, providerRefundId: 're_fixture' }), { code: 'REFUND_EVIDENCE_MISMATCH' });
});

test('provider errors and wrong-mode configuration are safe and never include raw secret/provider details', async () => {
  const f = adapterFixture();
  f.client.refunds.create = async () => { throw new Error('provider private token and customer email'); };
  await assert.rejects(f.provider.createRefund(input), error => error.code === 'REFUND_PROVIDER_UNAVAILABLE'
    && !error.message.includes('private token'));
  const live = createStripePaymentProvider({ stripeClient: f.client, secretKey: 'sk_live_fixture' });
  assert.throws(() => live.assertRefundReady(), { code: 'REFUND_PROVIDER_UNAVAILABLE' });
});

test('application Stripe factory defaults monetary issuance to disabled until explicitly enabled', () => {
  const f = adapterFixture();
  const disabled = createStripePaymentProvider({ stripeClient: f.client, secretKey: 'sk_test_fixture' });
  assert.throws(() => disabled.assertRefundReady(), { code: 'REFUND_PROCESSING_NOT_ENABLED' });
  assert.equal(f.calls.length, 0);
});

function financialFixture() {
  const confirmed = new Date(now.getTime() - 86400_000);
  const order = { _id: id('2'), instructorId: id('4'), status: 'paid', amountMinor: 1000, currency: 'EGP', commissionBps: 2000,
    platformAmountMinor: 200, instructorAmountMinor: 800, policyVersionId: id('5'), refundWindowSeconds: 14 * 86400,
    paymentConfirmedAt: confirmed, refundDeadlineAt: new Date(confirmed.getTime() + 14 * 86400_000),
    createdAt: new Date(confirmed.getTime() - 3600_000) };
  const payment = { orderId: order._id, provider: 'stripe', status: 'succeeded', paymentIntentId: 'pi_fixture',
    amountMinor: 1000, currency: 'EGP', paymentConfirmedAt: confirmed };
  const policy = { _id: id('5'), refundMode: 'full', refundWindowSeconds: 14 * 86400, approvalSource: 'product_delegation',
    approvedAt: new Date(now.getTime() - 20 * 86400_000), effectiveFrom: new Date(now.getTime() - 19 * 86400_000), lateAdminOverrideAllowed: true };
  const sale = { orderId: order._id, instructorId: order.instructorId, policyVersionId: policy._id,
    currency: 'EGP', amountMinor: 800, status: 'pending' };
  return { order, payment, policy, sale, now, overrideWindow: false };
}
test('financial admission uses frozen policy and trusted confirmation, including exact expiry and an explicit window-only override', () => {
  const f = financialFixture(); assert.doesNotThrow(() => assertRefundAdmission(f));
  f.now = new Date(f.order.refundDeadlineAt);
  assert.throws(() => assertRefundAdmission(f), { code: 'REFUND_WINDOW_EXPIRED' });
  f.overrideWindow = true; assert.doesNotThrow(() => assertRefundAdmission(f));
  f.policy.lateAdminOverrideAllowed = false;
  assert.throws(() => assertRefundAdmission(f), { code: 'REFUND_OVERRIDE_NOT_ALLOWED' });
});

test('legacy, wrong split, unapproved policy, mismatched confirmation and ledger evidence fail closed without using paidAt', () => {
  for (const mutate of [f => { f.order.paymentConfirmedAt = null; f.order.paidAt = now; },
    f => { f.order.policyVersionId = null; }, f => { f.order.platformAmountMinor = 1; },
    f => { f.payment.paymentConfirmedAt = new Date(0); }, f => { f.sale.amountMinor = 1; },
    f => { f.order.refundDeadlineAt = new Date(0); }, f => { f.policy.effectiveFrom = now; },
    f => { f.policy.approvalSource = 'unapproved'; }, f => { f.sale.status = 'reversed'; }]) {
    const f = financialFixture(); mutate(f);
    assert.throws(() => assertRefundAdmission(f), { code: 'FINANCIAL_RECONCILIATION_REQUIRED' });
  }
});

test('accepted refund receipt stays requested while safe current DTO reports the persisted state', () => {
  const row = { _id: id('1'), orderId: id('2'), amountMinor: 1000, currency: 'EGP', status: 'pending',
    createdAt: now, updatedAt: now, providerRefundId: 're_secret', idempotencyKey: 'private-key', paymentIntentId: 'pi_private' };
  assert.equal(toAcceptedRefund(row).status, 'requested');
  assert.equal(toRefund(row).status, 'pending');
  for (const dto of [toAcceptedRefund(row), toRefund(row)]) {
    assert.equal(JSON.stringify(dto).includes('secret'), false);
    assert.equal('paymentIntentId' in dto, false); assert.equal('idempotencyKey' in dto, false);
  }
});
