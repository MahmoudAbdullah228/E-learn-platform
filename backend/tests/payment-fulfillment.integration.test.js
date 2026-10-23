import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';

import mongoose from 'mongoose';
import request from 'supertest';
import Stripe from 'stripe';

import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { Category } from '../src/models/Category.js';
import { Course } from '../src/models/Course.js';
import { EarningEntry } from '../src/models/EarningEntry.js';
import { Enrollment } from '../src/models/Enrollment.js';
import { Order } from '../src/models/Order.js';
import { Payment } from '../src/models/Payment.js';
import { User } from '../src/models/User.js';
import { WebhookEvent } from '../src/models/WebhookEvent.js';
import { createCheckoutService } from '../src/modules/checkout/checkout.service.js';
import { createPaymentInboxService } from '../src/modules/payments/paymentInbox.service.js';
import { createPaymentOperationsService } from '../src/modules/payments/paymentOperations.service.js';
import { createPaymentWebhookWorker } from '../src/services/paymentWebhookWorker.service.js';
import { createStripePaymentProvider } from '../src/services/stripePayment.service.js';

const secret = 'whsec_fulfillment_fixture';
const sdk = new Stripe('sk_test_fixture');
const sessions = new Map();
const events = new Map();
const workers = [];
let now;
let retrieveHook;
let retrieveCalls;
let listCalls;
const clock = () => new Date(now);
const client = { webhooks: sdk.webhooks, checkout: { sessions: {
  async create(body) {
    const raw = { id: `cs_test_${body.client_reference_id}`, object: 'checkout.session',
      livemode: false, mode: 'payment', status: 'open', payment_status: 'unpaid',
      client_reference_id: body.client_reference_id, metadata: body.metadata,
      amount_total: body.line_items[0].price_data.unit_amount, currency: 'egp',
      expires_at: body.expires_at, payment_intent: null,
      url: `https://checkout.stripe.com/c/pay/${body.client_reference_id}` };
    sessions.set(raw.id, raw);
    return raw;
  },
  async retrieve(id) {
    retrieveCalls += 1;
    if (retrieveHook) await retrieveHook();
    return sessions.get(id);
  },
} }, events: {
  async retrieve(id) { return events.get(id); },
  async list() { listCalls += 1; return { data: [...events.values()], has_more: false }; },
} };
const provider = createStripePaymentProvider({ secretKey: 'sk_test_fixture', webhookSecret: secret,
  successUrl: 'https://example.test/success', cancelUrl: 'https://example.test/cancel', stripeClient: client });
const inbox = createPaymentInboxService({ provider, clock });
const app = createApp({ paymentProvider: provider });
const models = [WebhookEvent, EarningEntry, Enrollment, Payment, Order, Course, Category, User];
let ready = false;
before(async () => {
  await connectDatabase({ maxRetries: 1 });
  assert.match(mongoose.connection.name, /_test$/);
  await Promise.all(models.map(Model => Model.init()));
  ready = true;
});
beforeEach(async () => {
  await Promise.all(models.map(Model => Model.deleteMany({})));
  now = Date.now(); sessions.clear(); events.clear(); retrieveHook = undefined;
  retrieveCalls = 0; listCalls = 0;
});
afterEach(async () => {
  await Promise.all(workers.splice(0).map(worker => worker.stop()));
});
after(async () => {
  try {
    if (ready && mongoose.connection.readyState === 1) {
      await Promise.all(models.map(Model => Model.deleteMany({})));
    }
  } finally { await disconnectDatabase(); }
});
function worker() {
  const value = createPaymentWebhookWorker({ provider, clock, shutdownTimeoutMs: 50 });
  workers.push(value);
  return value;
}
async function fixture() {
  const student = await User.create({ name: 'Student', email: 'payment-student@example.test',
    passwordHash: 'not-used-for-login', emailVerifiedAt: clock() });
  const instructor = await User.create({ name: 'Instructor', email: 'payment-owner@example.test',
    roles: ['instructor'], passwordHash: 'not-used-for-login', emailVerifiedAt: clock() });
  const category = await Category.create({ name: 'Payments', slug: 'payments' });
  const course = await Course.create({ instructorId: instructor.id, categoryId: category.id,
    title: 'Payment Test Course', slug: 'payment-test-course', description: 'A detailed payment test course.',
    priceMinor: 12347, status: 'published', publishedAt: clock() });
  const checkout = createCheckoutService({ provider, clock });
  const result = await checkout.checkout({ studentId: student.id, courseId: course.id });
  await checkout.stop();
  const order = await Order.findById(result.data.order.id);
  const raw = sessions.get(`cs_test_${order.id}`);
  return { student, instructor, course, order, raw };
}
function markPaid(raw) {
  Object.assign(raw, { status: 'complete', payment_status: 'paid', payment_intent: {
    id: `pi_${raw.client_reference_id}`, livemode: false, status: 'succeeded',
    amount: raw.amount_total, amount_received: raw.amount_total,
    currency: raw.currency, metadata: raw.metadata,
  } });
}
function event(raw, id = 'evt_success', type = 'checkout.session.completed') {
  const value = { id, type, livemode: false, created: Math.floor(now / 1000),
    data: { object: structuredClone(raw) } };
  events.set(id, value);
  return value;
}
async function accept(value) {
  const rawBody = Buffer.from(JSON.stringify(value));
  const signature = sdk.webhooks.generateTestHeaderString({ payload: rawBody.toString(), secret });
  await inbox.receive({ rawBody, signature });
}
async function assertUnpaid(order) {
  assert.equal((await Order.findById(order.id)).status, 'pending');
  assert.equal(await Enrollment.countDocuments(), 0);
  assert.equal(await EarningEntry.countDocuments(), 0);
}

test('raw signed webhook is durably accepted before worker effects; DTO and payload exclude customer secrets', async () => {
  const { order, raw, instructor } = await fixture(); markPaid(raw);
  const value = event(raw);
  value.data.object.customer_email = 'private@example.test';
  const body = JSON.stringify(value);
  const signature = sdk.webhooks.generateTestHeaderString({ payload: body, secret });
  const response = await request(app).post('/api/v1/webhooks/stripe')
    .set('Content-Type', 'application/json').set('Stripe-Signature', signature).send(body).expect(200);
  assert.deepEqual(response.body, { data: { received: true } });
  assert.equal(response.headers['cache-control'], 'no-store');
  await assertUnpaid(order);
  const stored = await WebhookEvent.findOne();
  assert.equal(stored.payload, undefined);
  assert.equal(stored.leaseId, undefined);
  const evidence = await WebhookEvent.findOne().select('+payload');
  assert.equal(JSON.stringify(evidence.payload).includes('private'), false);
  now = Date.now();
  await worker().processNext();
  const paid = await Order.findById(order.id);
  assert.equal(paid.status, 'paid'); assert.ok(paid.paidAt); assert.equal(paid.purchaseSlotActive, true);
  assert.equal((await Payment.findOne()).status, 'succeeded');
  assert.equal((await Enrollment.findOne()).sourceOrderId.toString(), order.id);
  const earning = await EarningEntry.findOne();
  assert.equal(earning.instructorId.toString(), instructor.id);
  assert.equal(earning.amountMinor, order.instructorAmountMinor);
  assert.equal(earning.status, 'pending'); assert.equal(earning.eligibleAt, null);
  assert.equal((await WebhookEvent.findOne()).status, 'processed');
});

test('invalid signatures, altered raw bytes, live mode, malformed supported evidence and oversized bodies never enter inbox', async () => {
  const { raw } = await fixture(); markPaid(raw);
  const value = event(raw); const body = JSON.stringify(value);
  const signature = sdk.webhooks.generateTestHeaderString({ payload: body, secret });
  await request(app).post('/api/v1/webhooks/stripe').send(value).expect(400);
  await request(app).post('/api/v1/webhooks/stripe').set('Stripe-Signature', signature)
    .set('Content-Type', 'application/json').send(`${body} `).expect(400);
  for (const invalid of [{ ...value, livemode: true }, { ...value, account: 'acct_foreign' },
    { ...value, data: { object: { ...raw, amount_total: -1 } } }]) {
    await assert.rejects(accept(invalid), { code: 'INVALID_PAYMENT_EVENT' });
  }
  await request(app).post('/api/v1/webhooks/stripe').set('Content-Type', 'application/json')
    .send('x'.repeat(1024 * 1024 + 1)).expect(413);
  assert.equal(await WebhookEvent.countDocuments(), 0);
});

test('persistence failure returns 5xx with safe error and cannot acknowledge lost events', async () => {
  const original = WebhookEvent.create;
  WebhookEvent.create = async () => { throw new Error('database secret and private payload'); };
  try {
    const body = JSON.stringify({ id: 'evt_unknown', type: 'unhandled.event', livemode: false,
      created: Math.floor(now / 1000), data: { object: {} } });
    const signature = sdk.webhooks.generateTestHeaderString({ payload: body, secret });
    const res = await request(app).post('/api/v1/webhooks/stripe').set('Content-Type', 'application/json')
      .set('Stripe-Signature', signature).send(body).expect(500);
    assert.equal(res.body.error.code, 'INTERNAL_SERVER_ERROR');
    assert.equal(JSON.stringify(res.body).includes('secret'), false);
  } finally { WebhookEvent.create = original; }
});

test('unsupported events are stored ignored without provider reads or financial effects', async () => {
  await accept({ id: 'evt_unknown', type: 'payment_intent.succeeded', livemode: false,
    created: Math.floor(now / 1000), data: { object: { customer: 'private' } } });
  assert.equal((await WebhookEvent.findOne()).status, 'ignored');
  assert.equal(await worker().processNext(), false); assert.equal(retrieveCalls, 0);
});

test('same ID redelivery and different success IDs across concurrent workers fulfill exactly once', async () => {
  const { order, raw } = await fixture(); markPaid(raw);
  const first = event(raw); const second = event(raw, 'evt_second', 'checkout.session.async_payment_succeeded');
  await Promise.all([accept(first), accept(first), accept(second)]);
  assert.equal(await WebhookEvent.countDocuments(), 2);
  await Promise.all([worker().processNext(), worker().processNext()]);
  assert.equal((await Order.findById(order.id)).status, 'paid');
  assert.equal(await Enrollment.countDocuments(), 1); assert.equal(await EarningEntry.countDocuments(), 1);
  assert.equal(await WebhookEvent.countDocuments({ status: 'processed' }), 2);
  await accept(first);
  assert.equal(await worker().processNext(), false);
});

test('event duplicate cannot overwrite retained evidence or reopen processed/failed status', async () => {
  const { raw } = await fixture(); markPaid(raw);
  const value = event(raw); await accept(value); await worker().processNext();
  value.data.object.amount_total += 1;
  await accept(value);
  const stored = await WebhookEvent.findOne().select('+payload');
  assert.equal(stored.payload.amountMinor, raw.amount_total); assert.equal(stored.status, 'processed');
  await WebhookEvent.updateOne({ _id: stored.id }, { $set: { status: 'failed' } });
  await accept(value); assert.equal((await WebhookEvent.findOne()).status, 'failed');
});

test('failure/expiration after success never regresses paid or revokes enrollment', async () => {
  const { order, raw } = await fixture(); markPaid(raw);
  await accept(event(raw)); await worker().processNext();
  const delayed = structuredClone(raw); delayed.status = 'expired'; delayed.payment_status = 'unpaid';
  await accept(event(delayed, 'evt_expired', 'checkout.session.expired'));
  await accept(event(delayed, 'evt_failed', 'checkout.session.async_payment_failed'));
  await worker().processNext(); await worker().processNext();
  assert.equal((await Order.findById(order.id)).status, 'paid');
  assert.equal((await Enrollment.findOne()).status, 'active');
  assert.equal(await EarningEntry.countDocuments(), 1);
});

test('confirmed expiration releases slot once; repeat terminal event is harmless', async () => {
  const { order, raw } = await fixture(); raw.status = 'expired';
  await accept(event(raw, 'evt_expired', 'checkout.session.expired'));
  await accept(event(raw, 'evt_expired_two', 'checkout.session.expired'));
  await Promise.all([worker().processNext(), worker().processNext()]);
  const closed = await Order.findById(order.id);
  assert.equal(closed.status, 'cancelled'); assert.equal(closed.purchaseSlotActive, false);
  assert.equal((await Payment.findOne()).status, 'failed');
  assert.equal(await WebhookEvent.countDocuments({ status: 'processed' }), 2);
  assert.equal(await Enrollment.countDocuments(), 0);
});

test('stale failure before success cannot cancel a session currently paid', async () => {
  const { order, raw } = await fixture();
  const delayed = event(raw, 'evt_delayed', 'checkout.session.async_payment_failed');
  markPaid(raw); await accept(delayed); await accept(event(raw));
  const work = worker(); await work.processNext(); await assertUnpaid(order);
  await work.processNext(); assert.equal((await Order.findById(order.id)).status, 'paid');
  now += 20_000; await work.processNext();
  assert.equal(await WebhookEvent.countDocuments({ status: 'processed' }), 2);
});

test('delayed-method unpaid completion does not fulfill; later succeeded event does', async () => {
  const { order, raw } = await fixture(); raw.status = 'complete';
  await accept(event(raw)); await worker().processNext(); await assertUnpaid(order);
  markPaid(raw);
  await accept(event(raw, 'evt_async', 'checkout.session.async_payment_succeeded'));
  await worker().processNext(); assert.equal((await Order.findById(order.id)).status, 'paid');
});

test('financial receipt survives post-checkout suspension, unpublishing and price/instructor changes', async () => {
  const { order, raw, student, instructor, course } = await fixture(); markPaid(raw);
  await User.updateOne({ _id: student.id }, { $set: { status: 'suspended' } });
  await User.updateOne({ _id: instructor.id }, { $set: { status: 'suspended' } });
  await Course.updateOne({ _id: course.id }, { $set: { status: 'unavailable', priceMinor: 500 } });
  await accept(event(raw)); await worker().processNext();
  assert.equal((await Order.findById(order.id)).status, 'paid');
  assert.equal((await EarningEntry.findOne()).amountMinor, order.instructorAmountMinor);
});

test('lost Checkout reference can safely bind verified session and intent from persisted snapshot', async () => {
  const { order, raw } = await fixture(); markPaid(raw);
  await Payment.updateOne({ orderId: order.id }, { $set: { checkoutSessionId: null, status: 'created' } });
  await accept(event(raw)); await worker().processNext();
  const payment = await Payment.findOne().select('+checkoutSessionId +paymentIntentId');
  assert.equal(payment.checkoutSessionId, raw.id); assert.equal(payment.paymentIntentId, raw.payment_intent.id);
  assert.equal(payment.status, 'succeeded');
});

test('mismatched signed evidence and expanded intent fail closed with safe dead-letter code', async () => {
  const { order, raw } = await fixture(); markPaid(raw);
  const value = event(raw); value.data.object.metadata.orderId = new mongoose.Types.ObjectId().toString();
  await accept(value); await worker().processNext(); await assertUnpaid(order);
  assert.equal((await WebhookEvent.findOne()).lastError, 'PAYMENT_EVIDENCE_MISMATCH');
  raw.payment_intent.amount_received -= 1;
  await accept(event(raw, 'evt_intent_amount')); await worker().processNext(); await assertUnpaid(order);
  assert.equal(await WebhookEvent.countDocuments({ status: 'failed' }), 2);
});

test('cross-order session and unknown order cannot fulfill another buyer', async () => {
  const { order, raw } = await fixture(); markPaid(raw);
  const value = event(raw); const foreign = new mongoose.Types.ObjectId().toString();
  value.data.object.client_reference_id = foreign; value.data.object.metadata.orderId = foreign;
  await accept(value); await worker().processNext(); await assertUnpaid(order);
  assert.equal((await WebhookEvent.findOne()).status, 'failed');
});

test('current Stripe session and intent mismatches never grant access or earnings', async () => {
  const { order, raw } = await fixture(); markPaid(raw);
  const original = structuredClone(raw);
  const changes = [
    s => { s.amount_total += 1; },
    s => { s.currency = 'usd'; },
    s => { s.livemode = true; },
    s => { s.expires_at += 1; },
    s => { s.client_reference_id = new mongoose.Types.ObjectId().toString(); },
    s => { s.payment_intent.id = 'pi_foreign'; },
    s => { s.payment_intent.currency = 'usd'; },
    s => { s.payment_intent.livemode = true; },
    s => { s.payment_intent.metadata.orderId = new mongoose.Types.ObjectId().toString(); },
    s => { s.payment_intent.amount += 1; },
    s => { s.payment_intent.status = 'processing'; },
  ];
  const work = worker();
  for (const [index, change] of changes.entries()) {
    await accept(event(original, `evt_mismatch_${index}`));
    const modified = structuredClone(original); change(modified); sessions.set(raw.id, modified);
    await work.processNext(); await assertUnpaid(order);
    assert.notEqual((await WebhookEvent.findOne({ eventId: `evt_mismatch_${index}` })).status, 'processed');
  }
  sessions.set(raw.id, original);
});

test('stored Checkout/PaymentIntent reference conflicts cannot be rebound by events', async () => {
  const { order, raw } = await fixture(); markPaid(raw);
  await Payment.updateOne({ orderId: order.id }, { $set: { checkoutSessionId: 'cs_test_foreign' } });
  await accept(event(raw)); await worker().processNext(); await assertUnpaid(order);
  await Payment.updateOne({ orderId: order.id },
    { $set: { checkoutSessionId: raw.id, paymentIntentId: 'pi_foreign' } });
  await accept(event(raw, 'evt_intent_conflict')); await worker().processNext(); await assertUnpaid(order);
});

test('same event identity with another type is rejected and preserves the original record', async () => {
  const { raw } = await fixture(); markPaid(raw); await accept(event(raw));
  await assert.rejects(accept(event(raw, 'evt_success', 'checkout.session.expired')),
    { code: 'PAYMENT_EVENT_CONFLICT' });
  assert.equal((await WebhookEvent.findOne()).eventType, 'checkout.session.completed');
});

test('transaction failure rolls back paid/payment/enrollment/event; retry records one earning', async () => {
  const { order, raw } = await fixture(); markPaid(raw); await accept(event(raw));
  const original = EarningEntry.create;
  EarningEntry.create = async () => { throw new Error('forced ledger failure with secret'); };
  const work = worker();
  try { await work.processNext(); } finally { EarningEntry.create = original; }
  await assertUnpaid(order); assert.equal((await Payment.findOne()).status, 'processing');
  const failed = await WebhookEvent.findOne();
  assert.equal(failed.status, 'pending'); assert.equal(failed.attempts, 1);
  assert.equal(failed.lastError, 'PAYMENT_PROCESSING_FAILED');
  now += 20_000; await work.processNext();
  assert.equal((await Order.findById(order.id)).status, 'paid');
  assert.equal(await Enrollment.countDocuments(), 1); assert.equal(await EarningEntry.countDocuments(), 1);
});

test('expired lease fences stale worker, while another worker fulfills once', async () => {
  const { order, raw } = await fixture(); markPaid(raw); await accept(event(raw));
  let entered; let release;
  const entering = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  retrieveHook = async () => { entered(); await gate; };
  const old = worker(); const pending = old.processNext(); await entering;
  retrieveHook = undefined; now += 120_001;
  await worker().processNext(); release(); await pending;
  assert.equal((await Order.findById(order.id)).status, 'paid');
  assert.equal(await EarningEntry.countDocuments(), 1); assert.equal(await Enrollment.countDocuments(), 1);
});

test('shutdown during provider wait leaves recoverable lease, no retry consumption or late DB effects', async () => {
  const { order, raw } = await fixture(); markPaid(raw); await accept(event(raw));
  let entered; let release;
  const entering = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  retrieveHook = async () => { entered(); await gate; };
  const work = worker(); const pending = work.processNext(); await entering;
  await work.stop(); await pending; release(); retrieveHook = undefined;
  await new Promise(resolve => setImmediate(resolve)); await assertUnpaid(order);
  const stored = await WebhookEvent.findOne();
  assert.equal(stored.status, 'processing'); assert.equal(stored.attempts, 0);
  now += 120_001; await worker().processNext();
  assert.equal((await Order.findById(order.id)).status, 'paid');
});

test('shutdown between transactional stages rolls back all effects without consuming a retry', async () => {
  const { order, raw } = await fixture(); markPaid(raw); await accept(event(raw));
  const original = Enrollment.create;
  let entered; let release;
  const entering = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  Enrollment.create = async (...args) => { entered(); await gate; return original.apply(Enrollment, args); };
  const work = worker();
  try {
    const pending = work.processNext(); await entering; await work.stop(); release(); await pending;
  } finally { Enrollment.create = original; }
  await assertUnpaid(order); assert.equal((await Payment.findOne()).status, 'processing');
  const stored = await WebhookEvent.findOne();
  assert.equal(stored.status, 'processing'); assert.equal(stored.attempts, 0);
  now += 120_001; await worker().processNext();
  assert.equal((await Order.findById(order.id)).status, 'paid');
});

test('bounded retries exhaust safely; explicit replay only reopens failed events', async () => {
  const { order, raw } = await fixture(); markPaid(raw); await accept(event(raw));
  retrieveHook = async () => { throw new Error('Stripe credentials secret'); };
  const work = worker();
  for (let attempt = 0; attempt < 8; attempt += 1) { await work.processNext(); now += 3_600_001; }
  await assertUnpaid(order); assert.equal((await WebhookEvent.findOne()).attempts, 8);
  assert.equal((await WebhookEvent.findOne()).status, 'failed');
  retrieveHook = undefined;
  assert.equal((await inbox.replay('evt_success')).modifiedCount, 1);
  await work.processNext();
  assert.equal((await Order.findById(order.id)).status, 'paid');
  assert.equal((await inbox.replay('evt_success')).modifiedCount, 0);
});

test('reconciliation uses authenticated provider events through same inbox; dry run is side-effect free', async () => {
  const { order, raw } = await fixture(); markPaid(raw); event(raw);
  const ops = createPaymentOperationsService({ provider, inbox, clock });
  assert.deepEqual(await ops.run({ orderId: order.id }), { dryRun: true, queued: 0 });
  assert.equal(listCalls, 0); assert.equal(await WebhookEvent.countDocuments(), 0);
  await ops.run({ orderId: order.id, execute: true });
  await assertUnpaid(order); await worker().processNext();
  assert.equal((await Order.findById(order.id)).status, 'paid');
  assert.equal(listCalls, 1);
  await ops.run({ eventId: 'evt_success', execute: true });
  assert.equal(await WebhookEvent.countDocuments(), 1);
  await assert.rejects(ops.run({ orderId: order.id, replay: true, execute: true }));
});

test('reconciliation rejects missing/old orders and foreign event identity without queuing fabricated proof', async () => {
  const { order } = await fixture();
  const ops = createPaymentOperationsService({ provider, inbox, clock });
  await assert.rejects(ops.run({ orderId: new mongoose.Types.ObjectId().toString(), execute: true }),
    { code: 'ORDER_NOT_FOUND' });
  now += 31 * 86400_000;
  await assert.rejects(ops.run({ orderId: order.id, execute: true }),
    { code: 'PAYMENT_EVENT_RETENTION_EXCEEDED' });
  assert.equal(listCalls, 0);
  events.set('evt_requested', { id: 'evt_foreign' });
  await assert.rejects(inbox.recover('evt_requested'), { code: 'PAYMENT_EVENT_CONFLICT' });
  assert.equal(await WebhookEvent.countDocuments(), 0);
});

test('financial and inbox uniqueness/immutability guards reject accidental mutations', async () => {
  const { order, raw } = await fixture(); markPaid(raw); await accept(event(raw)); await worker().processNext();
  await assert.rejects(Enrollment.create({ studentId: order.studentId, courseId: order.courseId,
    enrolledAt: clock() }), { code: 11000 });
  await assert.rejects(EarningEntry.create({ instructorId: order.instructorId, orderId: order.id,
    type: 'sale', amountMinor: order.instructorAmountMinor, currency: 'EGP' }), { code: 11000 });
  await assert.rejects(EarningEntry.updateOne({ orderId: order.id }, { $set: { amountMinor: 1 } }));
  await assert.rejects(WebhookEvent.updateOne({ eventId: 'evt_success' },
    { $set: { 'payload.amountMinor': 1 } }));
});
