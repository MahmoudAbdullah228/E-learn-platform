import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { Category } from '../src/models/Category.js';
import { Course } from '../src/models/Course.js';
import { Enrollment } from '../src/models/Enrollment.js';
import { Order } from '../src/models/Order.js';
import { Payment } from '../src/models/Payment.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { User } from '../src/models/User.js';
import { createSessionService } from '../src/modules/auth/session.service.js';
import { createCheckoutService } from '../src/modules/checkout/checkout.service.js';
import { env } from '../src/config/env.js';
import { createStripePaymentProvider } from '../src/services/stripePayment.service.js';

const password = 'checkout integration test password';
const sessions = new Map();
const requests = [];
let failAfterCreate = false;
let tamper;
let blockCreate;
let providerQueries = 0;
let rejectAmount = false;
const stripeClient = { checkout: { sessions: {
  async create(body, options) {
    requests.push(structuredClone({ body, options }));
    if (rejectAmount) throw Object.assign(new Error('private provider error'),
      { type: 'StripeInvalidRequestError', code: 'amount_too_small' });
    if (blockCreate) await blockCreate();
    let session = sessions.get(options.idempotencyKey);
    if (!session) {
      session = { id: `cs_test_${body.client_reference_id}`, livemode: false, mode: 'payment',
        status: 'open', payment_status: 'unpaid', payment_intent: null,
        amount_total: body.line_items[0].price_data.unit_amount, currency: 'egp',
        client_reference_id: body.client_reference_id, metadata: body.metadata,
        url: `https://checkout.stripe.com/c/pay/${body.client_reference_id}`,
        expires_at: body.expires_at };
      sessions.set(options.idempotencyKey, session);
    }
    if (failAfterCreate) { failAfterCreate = false; throw new Error('lost response with secrets'); }
    return tamper ? { ...session, ...tamper } : session;
  },
  async retrieve(id) {
    providerQueries += 1;
    const session = [...sessions.values()].find(s => s.id === id);
    if (!session) throw new Error('provider record missing');
    return tamper ? { ...session, ...tamper } : session;
  },
  async list() {
    providerQueries += 1;
    return { data: [...sessions.values()], has_more: false };
  },
} } };
const provider = createStripePaymentProvider({ secretKey: 'sk_test_checkout',
  webhookSecret: 'whsec_checkout', successUrl: 'https://example.test/success',
  cancelUrl: 'https://example.test/cancel', stripeClient });
const app = createApp({ paymentProvider: provider });
const models = [Payment, Order, Enrollment, Course, Category, RefreshSession, User];
let ready = false;
before(async () => {
  await connectDatabase({ maxRetries: 1 });
  assert.match(mongoose.connection.name, /_test$/);
  await Promise.all(models.map(Model => Model.init()));
  ready = true;
});
beforeEach(async () => {
  await Promise.all(models.map(Model => Model.deleteMany({})));
  sessions.clear(); requests.length = 0; failAfterCreate = false; tamper = undefined;
  blockCreate = undefined; providerQueries = 0;
  rejectAmount = false;
});
after(async () => {
  try {
    if (ready && mongoose.connection.readyState === 1) {
      await Promise.all(models.map(Model => Model.deleteMany({})));
    }
  } finally { await disconnectDatabase(); }
});

async function actor(email, roles = ['student']) {
  const user = await User.create({ name: 'Checkout Actor', email, roles,
    passwordHash: await bcrypt.hash(password, 10), emailVerifiedAt: new Date() });
  const login = await createSessionService().login({ email, password });
  return { user, token: login.accessToken };
}
async function fixture() {
  const student = await actor('checkout-student@example.test');
  const instructor = await actor('checkout-owner@example.test', ['student', 'instructor']);
  const category = await Category.create({ name: 'Checkout Category', slug: 'checkout-category' });
  const course = await Course.create({ instructorId: instructor.user.id, categoryId: category.id,
    title: 'Secure Checkout Course', slug: 'secure-checkout-course',
    description: 'A detailed course for checkout integration tests.', priceMinor: 12345,
    status: 'published', publishedAt: new Date() });
  return { student, instructor, course };
}
const checkout = (courseId, token, application = app) => request(application)
  .post(`/api/v1/courses/${courseId}/checkout`).auth(token, { type: 'bearer' });

test('checkout snapshots server-owned money, returns safe DTO, and resumes the same session', async () => {
  const { student, course } = await fixture();
  const created = await checkout(course.id, student.token).expect(201);
  assert.equal(created.headers['cache-control'], 'no-store');
  assert.equal(created.body.data.order.amountMinor, 12345);
  const order = await Order.findById(created.body.data.order.id);
  assert.equal(order.platformAmountMinor, 2469);
  assert.equal(order.instructorAmountMinor, 9876);
  assert.equal(order.commissionBps, 2000);
  const payment = await Payment.findOne({ orderId: order.id }).select('+checkoutRequest');
  assert.equal(payment.status, 'processing');
  assert.equal(payment.checkoutRequest.customerEmail, student.user.email);
  await Course.updateOne({ _id: course.id }, { $set: { title: 'Later price', priceMinor: 9999 } });
  const resumed = await checkout(course.id, student.token).expect(200);
  assert.equal(resumed.body.data.order.id, order.id);
  assert.equal(resumed.body.data.order.amountMinor, 12345);
  assert.equal(resumed.body.data.order.courseTitle, 'Secure Checkout Course');
  assert.equal(resumed.body.data.checkoutUrl, created.body.data.checkoutUrl);
  assert.equal(requests.length, 1);
  assert.equal(await Order.countDocuments(), 1);
  for (const secret of ['checkoutSessionId', 'idempotencyKey', 'customerEmail', 'checkoutLeaseId',
    'paymentIntentId', 'platformAmountMinor']) assert.equal(JSON.stringify(created.body).includes(secret), false);
});

test('checkout rejects unauthorized, unverified, suspended, own, free and hidden courses', async () => {
  const { student, instructor, course } = await fixture();
  await request(app).post(`/api/v1/courses/${course.id}/checkout`).expect(401);
  const admin = await actor('checkout-admin@example.test', ['admin']);
  await checkout(course.id, admin.token).expect(403);
  await checkout(course.id, instructor.token).expect(403);
  await User.updateOne({ _id: student.user.id }, { $set: { emailVerifiedAt: null } });
  await checkout(course.id, student.token).expect(401);
  await User.updateOne({ _id: student.user.id },
    { $set: { emailVerifiedAt: new Date(), status: 'suspended' } });
  await checkout(course.id, student.token).expect(401);
  await User.updateOne({ _id: student.user.id }, { $set: { status: 'active' } });
  for (const status of ['draft', 'pending_review', 'rejected', 'unavailable']) {
    await Course.updateOne({ _id: course.id }, { $set: { status } });
    await checkout(course.id, student.token).expect(404);
  }
  await Course.updateOne({ _id: course.id }, { $set: { status: 'published', priceMinor: 0 } });
  await checkout(course.id, student.token).expect(409);
  await checkout('bad-id', student.token).expect(400);
  await Course.updateOne({ _id: course.id }, { $set: { priceMinor: 12345 } });
  for (const body of [{ amountMinor: 1 }, { courseId: course.id }, { returnUrl: 'https://evil.test' }]) {
    await checkout(course.id, student.token).send(body).expect(400);
  }
  assert.equal(await Order.countDocuments(), 0);
  assert.equal(requests.length, 0);
});

test('lost create response retries the exact persisted request across application instances', async () => {
  const { student, course } = await fixture();
  failAfterCreate = true;
  const unavailable = await checkout(course.id, student.token).expect(503);
  assert.equal(unavailable.body.error.code, 'PAYMENT_PROVIDER_UNAVAILABLE');
  assert.equal(JSON.stringify(unavailable.body).includes('secrets'), false);
  const order = await Order.findOne();
  assert.equal(order.purchaseSlotActive, true);
  const restarted = createApp({ paymentProvider: createStripePaymentProvider({
    secretKey: 'sk_test_checkout', webhookSecret: 'whsec_checkout',
    successUrl: 'https://changed.test/success', cancelUrl: 'https://changed.test/cancel', stripeClient,
  }) });
  await checkout(course.id, student.token, restarted).expect(200);
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(sessions.size, 1);
  assert.equal(await Order.countDocuments(), 1);
});

test('concurrent checkout requests reserve one purchase slot and dispatch one create', async () => {
  const { student, course } = await fixture();
  let entered;
  let release;
  const started = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  blockCreate = async () => { entered(); await blocked; };
  const first = checkout(course.id, student.token).then(response => response);
  try {
    await started;
    const second = await checkout(course.id, student.token).expect(409);
    assert.equal(second.body.error.code, 'PAYMENT_PENDING');
    assert.equal(await Order.countDocuments(), 1);
    assert.equal(await Payment.countDocuments(), 1);
    assert.equal(requests.length, 1);
  } finally { release(); }
  assert.equal((await first).status, 201);
});

test('only provider-confirmed unpaid expiration releases a purchase slot', async () => {
  const { student, course } = await fixture();
  const original = await checkout(course.id, student.token).expect(201);
  const session = [...sessions.values()][0];
  session.status = 'expired'; session.url = null;
  const replacement = await checkout(course.id, student.token).expect(201);
  assert.notEqual(replacement.body.data.order.id, original.body.data.order.id);
  const closed = await Order.findById(original.body.data.order.id);
  assert.equal(closed.status, 'cancelled');
  assert.equal(closed.purchaseSlotActive, false);
  assert.equal(await Order.countDocuments({ purchaseSlotActive: true }), 1);
});

test('completed, paid, or ambiguous intent states never release the slot or fulfill an order', async () => {
  const { student, course } = await fixture();
  await checkout(course.id, student.token).expect(201);
  const session = [...sessions.values()][0];
  for (const state of [
    { status: 'complete', payment_status: 'paid', payment_intent: 'pi_paid' },
    { status: 'expired', payment_status: 'unpaid',
      payment_intent: { id: 'pi_pending', status: 'processing' } },
  ]) {
    Object.assign(session, state);
    await checkout(course.id, student.token).expect(409);
    const order = await Order.findOne();
    assert.equal(order.status, 'pending');
    assert.equal(order.purchaseSlotActive, true);
  }
  assert.equal(requests.length, 1);
});

test('an old uncertain attempt is looked up, never recreated with a pruned key', async () => {
  const { student, course } = await fixture();
  failAfterCreate = true;
  await checkout(course.id, student.token).expect(503);
  const order = await Order.findOne();
  const clock = () => new Date(order.expiresAt.getTime() + 2 * 86400000);
  const service = createCheckoutService({ provider, clock });
  await assert.rejects(service.checkout({ studentId: student.user.id, courseId: course.id }),
    error => error.code === 'PAYMENT_PENDING');
  assert.equal(requests.length, 1);
  assert.equal(providerQueries, 1);
  sessions.clear();
  await assert.rejects(service.checkout({ studentId: student.user.id, courseId: course.id }),
    error => error.code === 'PAYMENT_PROVIDER_UNAVAILABLE');
  assert.equal((await Order.findById(order.id)).purchaseSlotActive, true);
});

test('provider snapshot mismatches never link or expose checkout', async () => {
  const { student, course } = await fixture();
  for (const override of [{ amount_total: 1 }, { metadata: { orderId: 'wrong-order' } },
    { client_reference_id: 'wrong-order' }, { livemode: true }, { currency: 'usd' },
    { url: 'https://evil.test/checkout' }]) {
    tamper = override;
    const response = await checkout(course.id, student.token).expect(503);
    assert.ok(response.body.error.code);
    assert.equal(response.body.data, undefined);
  }
  assert.equal(await Order.countDocuments(), 1);
  const payment = await Payment.findOne().select('+checkoutSessionId');
  assert.equal(payment.checkoutSessionId, null);
});

test('an old unknown attempt with no provider evidence keeps its purchase slot', async () => {
  const { student, course } = await fixture();
  failAfterCreate = true;
  await checkout(course.id, student.token).expect(503);
  const order = await Order.findOne();
  sessions.clear();
  const service = createCheckoutService({ provider,
    clock: () => new Date(order.expiresAt.getTime() + 2 * 86400000) });
  await assert.rejects(service.checkout({ studentId: student.user.id, courseId: course.id }),
    error => error.code === 'PAYMENT_RECONCILIATION_REQUIRED');
  assert.equal((await Order.findById(order.id)).purchaseSlotActive, true);
  assert.equal(requests.length, 1);
});

test('paid purchase and unique model indexes prevent another active purchase', async () => {
  const { student, course } = await fixture();
  await checkout(course.id, student.token).expect(201);
  const order = await Order.findOne();
  await Order.updateOne({ _id: order.id }, { $set: { status: 'paid' } });
  await checkout(course.id, student.token).expect(409);
  const copy = order.toObject(); delete copy._id;
  await assert.rejects(Order.create(copy), error => error.code === 11000);
  assert.equal(requests.length, 1);
});

test('database failure after provider creation preserves the attempt for idempotent recovery', async t => {
  const { student, course } = await fixture();
  let failed = false;
  const original = Payment.updateOne;
  t.mock.method(Payment, 'updateOne', function (filter, update, ...args) {
    if (!failed && update.$set?.checkoutSessionId) {
      failed = true;
      return Promise.reject(new Error('simulated database failure'));
    }
    return original.call(this, filter, update, ...args);
  });
  await checkout(course.id, student.token).expect(500);
  const order = await Order.findOne();
  assert.equal(order.purchaseSlotActive, true);
  await checkout(course.id, student.token).expect(200);
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(sessions.size, 1);
  assert.equal(await Order.countDocuments(), 1);
});

test('Order and Payment reservation rolls back atomically if payment persistence fails', async t => {
  const { student, course } = await fixture();
  t.mock.method(Payment, 'create', async () => { throw new Error('payment save failure'); });
  await checkout(course.id, student.token).expect(500);
  assert.equal(await Order.countDocuments(), 0);
  assert.equal(await Payment.countDocuments(), 0);
  assert.equal(requests.length, 0);
});

test('expiration rollback never releases the slot without closing the payment', async t => {
  const { student, course } = await fixture();
  await checkout(course.id, student.token).expect(201);
  [...sessions.values()][0].status = 'expired';
  const original = Order.updateOne;
  t.mock.method(Order, 'updateOne', function (filter, update, ...args) {
    if (update.$set?.status === 'cancelled') return Promise.reject(new Error('close failed'));
    return original.call(this, filter, update, ...args);
  });
  await checkout(course.id, student.token).expect(500);
  assert.equal((await Order.findOne()).purchaseSlotActive, true);
  assert.equal((await Payment.findOne()).status, 'processing');
  assert.equal(requests.length, 1);
  t.mock.restoreAll();
  await checkout(course.id, student.token).expect(201);
  assert.equal(await Order.countDocuments({ purchaseSlotActive: true }), 1);
});

test('definitive amount validation failure closes the unallocated attempt safely', async () => {
  const { student, course } = await fixture();
  rejectAmount = true;
  const rejected = await checkout(course.id, student.token).expect(409);
  assert.equal(rejected.body.error.code, 'PAYMENT_AMOUNT_UNSUPPORTED');
  const old = await Order.findOne();
  assert.equal(old.status, 'failed');
  assert.equal(old.purchaseSlotActive, false);
  assert.equal((await Payment.findOne()).status, 'failed');
  assert.equal(sessions.size, 0);
  rejectAmount = false;
  await checkout(course.id, student.token).expect(201);
  assert.equal(await Order.countDocuments({ purchaseSlotActive: true }), 1);
});

test('checkout rate limiting rejects before any new financial work and isolates students', async () => {
  const { student, course } = await fixture();
  const hits = new Map();
  const store = { localKeys: true,
    async increment(key) {
      const totalHits = (hits.get(key) ?? env.CHECKOUT_RATE_LIMIT_MAX - 1) + 1;
      hits.set(key, totalHits);
      return { totalHits, resetTime: new Date(Date.now() + 60000) };
    },
    async decrement() {}, async resetKey(key) { hits.delete(key); },
  };
  const limitedApp = createApp({ paymentProvider: provider,
    rateLimitStoreFactory: name => name === 'checkout' ? store : undefined });
  await checkout(course.id, student.token, limitedApp).expect(201);
  const limited = await checkout(course.id, student.token, limitedApp).expect(429);
  assert.ok(limited.headers['retry-after']);
  assert.equal(requests.length, 1);
  assert.equal(await Order.countDocuments(), 1);
  const other = await actor('checkout-other@example.test');
  await checkout(course.id, other.token, limitedApp).expect(201);
  assert.equal(requests.length, 2);
});

test('unavailable checkout rate-limit storage fails closed with a safe 503', async () => {
  const { student, course } = await fixture();
  const failedApp = createApp({ paymentProvider: provider,
    rateLimitStoreFactory: name => name !== 'checkout' ? undefined : {
      localKeys: true,
      async increment() { throw new Error('redis secret connection'); },
      async decrement() {}, async resetKey() {},
    } });
  const result = await checkout(course.id, student.token, failedApp).expect(503);
  assert.equal(result.body.error.code, 'RATE_LIMIT_UNAVAILABLE');
  assert.equal(JSON.stringify(result.body).includes('redis'), false);
  assert.equal(requests.length, 0);
  assert.equal(await Order.countDocuments(), 0);
});

test('money and provider input snapshots cannot be rewritten and private fields stay hidden', async () => {
  const { student, course } = await fixture();
  await checkout(course.id, student.token).expect(201);
  const order = await Order.findOne();
  const payment = await Payment.findOne();
  for (const field of ['checkoutRequest', 'idempotencyKey', 'checkoutSessionId',
    'paymentIntentId', 'checkoutLeaseId', 'checkoutLeaseUntil']) assert.equal(payment[field], undefined);
  await assert.rejects(Order.updateOne({ _id: order.id }, { $set: { amountMinor: 1,
    courseTitleSnapshot: 'Changed snapshot', instructorId: student.user.id } }), /snapshots/);
  await assert.rejects(Payment.updateOne({ _id: payment.id }, { $set: { amountMinor: 1,
    'checkoutRequest.customerEmail': 'attacker@example.test',
    'checkoutRequest.successUrl': 'https://evil.test', idempotencyKey: 'new-key' } }), /snapshots/);
  const unchangedOrder = await Order.findById(order.id);
  const unchangedPayment = await Payment.findById(payment.id).select('+checkoutRequest +idempotencyKey');
  assert.equal(unchangedOrder.amountMinor, 12345);
  assert.equal(unchangedOrder.courseTitleSnapshot, 'Secure Checkout Course');
  assert.equal(unchangedPayment.amountMinor, 12345);
  assert.equal(unchangedPayment.checkoutRequest.customerEmail, student.user.email);
  assert.equal(unchangedPayment.checkoutRequest.successUrl, 'https://example.test/success');
  assert.equal(unchangedPayment.idempotencyKey, requests[0].options.idempotencyKey);
});

test('expired leases can be reclaimed without a stale issuer overwriting the winner', async () => {
  const { student, course } = await fixture();
  let release;
  let entered;
  let attempts = 0;
  const started = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  blockCreate = async () => {
    if (++attempts === 1) { entered(); await blocked; }
  };
  const stale = checkout(course.id, student.token).then(response => response);
  try {
    await started;
    await Payment.updateOne({}, { $set: { checkoutLeaseUntil: new Date(Date.now() - 1) } });
    const recovered = await checkout(course.id, student.token).expect(200);
    assert.ok(recovered.body.data.checkoutUrl);
  } finally { release(); }
  assert.equal((await stale).status, 409);
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(sessions.size, 1);
  assert.equal(await Order.countDocuments(), 1);
  assert.equal((await Payment.findOne()).status, 'processing');
});

test('checkout shutdown fences late provider results and leaves a recoverable attempt', async t => {
  const { student, course } = await fixture();
  let release;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  blockCreate = async () => { entered(); await blocked; };
  const service = createCheckoutService({ provider, shutdownTimeoutMs: 10 });
  const work = service.checkout({ studentId: student.user.id, courseId: course.id });
  const rejected = assert.rejects(work, error => error.code === 'SERVICE_SHUTTING_DOWN');
  try {
    await started;
    await service.stop();
    await rejected;
    const write = t.mock.method(Payment, 'updateOne');
    release();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(write.mock.callCount(), 0);
    t.mock.restoreAll();
    await assert.rejects(service.checkout({ studentId: student.user.id, courseId: course.id }),
      error => error.code === 'SERVICE_SHUTTING_DOWN');
    const payment = await Payment.findOne().select('+checkoutSessionId +checkoutLeaseUntil');
    assert.equal(payment.checkoutSessionId, null);
    assert.ok(payment.checkoutLeaseUntil);
    const recovery = createCheckoutService({ provider,
      clock: () => new Date(payment.checkoutLeaseUntil.getTime() + 1) });
    try {
      const result = await recovery.checkout({ studentId: student.user.id, courseId: course.id });
      assert.equal(result.created, false);
      assert.ok(result.data.checkoutUrl);
      assert.equal(requests.length, 1);
    } finally { await recovery.stop(); }
    assert.equal(await Order.countDocuments(), 1);
  } finally {
    release();
    await service.stop();
    await rejected;
  }
});
