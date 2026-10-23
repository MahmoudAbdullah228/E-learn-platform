import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import mongoose from 'mongoose';

import { EarningEntry } from '../src/models/EarningEntry.js';
import { createPaymentOperationsService,
  paymentOperationSchema } from '../src/modules/payments/paymentOperations.service.js';
import { parsePaymentEvent } from '../src/modules/payments/payment.schemas.js';
import { createStripePaymentProvider } from '../src/services/stripePayment.service.js';

const providerOptions = { secretKey: 'sk_test_unit', webhookSecret: 'whsec_unit',
  successUrl: 'https://example.test/success', cancelUrl: 'https://example.test/cancel' };

test('payment operation scope is strict and execution is opt-in', async () => {
  for (const input of [{}, { eventId: 'evt_x', orderId: '0123456789abcdef01234567' },
    { orderId: '0123456789abcdef01234567', replay: true }, { eventId: 'evt_x', execute: 'true' },
    { eventId: 'evt_x', bulk: true }, { eventId: 'bad' }]) {
    assert.equal(paymentOperationSchema.safeParse(input).success, false);
  }
  const fail = () => { throw new Error('Dry run must not contact providers or inbox'); };
  const operations = createPaymentOperationsService({ provider: { retrieveEvent: fail },
    inbox: { replay: fail, recover: fail } });
  assert.deepEqual(await operations.run({ eventId: 'evt_example', replay: true }),
    { dryRun: true, queued: 0 });
});

test('CLI dry run succeeds without database connectivity; invalid/duplicate arguments fail safely', () => {
  const script = fileURLToPath(new URL('../scripts/payment-events.js', import.meta.url));
  const environment = { ...process.env, LOG_LEVEL: 'info',
    MONGO_TEST_URI: 'mongodb://127.0.0.1:1/unreachable_payment_test' };
  const result = spawnSync(process.execPath, [script, '--event-id', 'evt_example'],
    { env: environment, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"dryRun":true/);
  for (const args of [['--event-id'], ['--execute'], ['--event-id', 'evt_example', '--execute', '--execute']]) {
    const invalid = spawnSync(process.execPath, [script, ...args],
      { env: environment, encoding: 'utf8', timeout: 5000 });
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout.includes('stack'), false);
  }
});

test('Stripe reconciliation paginates supported events, dedupes and filters exact order references', async () => {
  const calls = [];
  const provider = createStripePaymentProvider({ ...providerOptions, stripeClient: { events: {
    async list(parameters) {
      calls.push(parameters);
      return calls.length === 1 ? { data: [
        { id: 'evt_other', data: { object: { metadata: { orderId: 'other' } } } },
        { id: 'evt_match', data: { object: { client_reference_id: 'order' } } },
      ], has_more: true } : { data: [
        { id: 'evt_match', data: { object: { metadata: { orderId: 'order' } } } },
        { id: 'evt_two', data: { object: { metadata: { orderId: 'order' } } } },
      ], has_more: false };
    },
    async retrieve(id) { return { id }; },
  } } });
  assert.deepEqual(await provider.findCheckoutEventIds({ orderId: 'order', createdAfter: 10, createdBefore: 20 }),
    ['evt_match', 'evt_two']);
  assert.equal(calls[1].starting_after, 'evt_match');
  assert.deepEqual(calls[0].created, { gte: 10, lte: 20 });
  assert.equal(calls[0].types.length, 4);
  assert.deepEqual(await provider.retrieveEvent('evt_match'), { id: 'evt_match' });
});

test('Stripe event scans are bounded and fail closed on malformed/incomplete/provider results', async () => {
  for (const kind of ['incomplete', 'malformed', 'error']) {
    let calls = 0;
    const provider = createStripePaymentProvider({ ...providerOptions, stripeClient: { events: {
      async list() {
        calls += 1;
        if (kind === 'error') throw new Error('Private provider credentials');
        if (kind === 'malformed') return { data: null, has_more: true };
        return { data: [{ id: `evt_${calls}`, data: { object: {} } }], has_more: true };
      },
      async retrieve() { throw new Error('Private provider credentials'); },
    } } });
    await assert.rejects(provider.findCheckoutEventIds({ orderId: 'order', createdAfter: 1, createdBefore: 10 }),
      { code: 'PAYMENT_PROVIDER_UNAVAILABLE', message: 'Payment processing is temporarily unavailable' });
    assert.equal(calls, kind === 'incomplete' ? 10 : 1);
    await assert.rejects(provider.retrieveEvent('evt_example'), { code: 'PAYMENT_PROVIDER_UNAVAILABLE' });
  }
});

test('event schemas discard unneeded Stripe data, reject unsafe money, and preserve bounded evidence', () => {
  const object = { id: 'cs_test_example', object: 'checkout.session', livemode: false,
    mode: 'payment', client_reference_id: '0123456789abcdef01234567',
    metadata: { orderId: '0123456789abcdef01234567', private: 'secret' },
    amount_total: 123, currency: 'egp', expires_at: 1790000000, status: 'complete',
    payment_status: 'paid', payment_intent: 'pi_example', customer_email: 'private@example.test' };
  const value = { id: 'evt_example', type: 'checkout.session.completed', livemode: false,
    created: 1790000000, data: { object } };
  const parsed = parsePaymentEvent(value);
  assert.equal(parsed.payload.amountMinor, 123);
  assert.equal(JSON.stringify(parsed).includes('secret'), false);
  assert.equal(JSON.stringify(parsed).includes('private@example.test'), false);
  for (const change of [{ amount_total: Number.MAX_SAFE_INTEGER + 1 }, { amount_total: 1.5 },
    { currency: 'usd' }, { livemode: true }, { expires_at: Infinity },
    { client_reference_id: 'not-an-id' }, { payment_intent: {} }]) {
    assert.throws(() => parsePaymentEvent({ ...value, data: { object: { ...object, ...change } } }),
      { code: 'INVALID_PAYMENT_EVENT', message: 'Invalid payment event' });
  }
});

test('ledger accepts only safe signed money with sale/refund reference invariants', async () => {
  const reference = new mongoose.Types.ObjectId();
  const valid = { instructorId: reference, orderId: reference, currency: 'EGP' };
  await new EarningEntry({ ...valid, type: 'sale', amountMinor: 0 }).validate();
  await new EarningEntry({ ...valid, type: 'refund_adjustment', amountMinor: -1,
    refundId: reference }).validate();
  for (const invalid of [{ type: 'sale', amountMinor: -1 }, { type: 'sale', amountMinor: 1, refundId: reference },
    { type: 'sale', amountMinor: 1.5 }, { type: 'refund_adjustment', amountMinor: -1 },
    { type: 'refund_adjustment', amountMinor: 1, refundId: reference }]) {
    await assert.rejects(new EarningEntry({ ...valid, ...invalid }).validate(), { name: 'ValidationError' });
  }
});
