import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';

import mongoose from 'mongoose';
import request from 'supertest';
import Stripe from 'stripe';

import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { assertTransactionSupport } from '../src/config/transactions.js';
import { AdminAuditEvent } from '../src/models/AdminAuditEvent.js';
import { Category } from '../src/models/Category.js';
import { Course } from '../src/models/Course.js';
import { EarningEntry } from '../src/models/EarningEntry.js';
import { Enrollment } from '../src/models/Enrollment.js';
import { FinancialHold } from '../src/models/FinancialHold.js';
import { FinancialPolicyVersion } from '../src/models/FinancialPolicyVersion.js';
import { InstructorFinanceState } from '../src/models/InstructorFinanceState.js';
import { Order } from '../src/models/Order.js';
import { Payment } from '../src/models/Payment.js';
import { Refund } from '../src/models/Refund.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { User } from '../src/models/User.js';
import { WebhookEvent } from '../src/models/WebhookEvent.js';
import { createCheckoutService } from '../src/modules/checkout/checkout.service.js';
import { createPaymentInboxService } from '../src/modules/payments/paymentInbox.service.js';
import { createRefundService } from '../src/modules/refunds/refund.service.js';
import { createRefundIssuanceService } from '../src/modules/refunds/refundIssuance.service.js';
import { createFinanceFoundationService } from '../src/modules/finance/finance.service.js';
import { inspectFinancialFoundation } from '../src/modules/finance/financeReadiness.service.js';
import { createPaymentWebhookWorker } from '../src/services/paymentWebhookWorker.service.js';
import { createStripePaymentProvider } from '../src/services/stripePayment.service.js';
import { signAccessToken } from '../src/utils/sessionToken.js';

const models = [AdminAuditEvent, WebhookEvent, EarningEntry, Enrollment, FinancialHold, FinancialPolicyVersion,
  InstructorFinanceState, Refund, Payment, Order, Course, Category, RefreshSession, User];
const reason = 'Customer refund following a documented administrative review';
let ready = false;
let app;
let now;
let behavior;
let calls;
const services = [];
const provider = {
  assertRefundReady() {},
  async createRefund(input) {
    calls.push(structuredClone(input));
    assert.equal(await FinancialHold.countDocuments({ paymentId: input.paymentId, resolvedAt: null }), 1);
    assert.equal(await AdminAuditEvent.countDocuments({ action: 'refund.requested', targetId: input.refundId }), 1);
    return behavior ? behavior(input) : evidence(input);
  },
};
const evidence = input => ({ refundId: input.refundId, orderId: input.orderId, paymentId: input.paymentId,
  paymentIntentId: input.paymentIntentId, amountMinor: input.amountMinor, currency: input.currency,
  providerRefundId: `re_${input.refundId}`, status: 'pending', createdAt: new Date(now), livemode: false });
before(async () => {
  await connectDatabase({ maxRetries: 1 }); assert.match(mongoose.connection.name, /_test$/);
  await assertTransactionSupport(); await Promise.all(models.map(Model => Model.init())); ready = true;
});
async function clear() {
  assert.equal(ready && mongoose.connection.readyState === 1, true);
  assert.match(mongoose.connection.name, /_test$/);
  await Promise.all(models.map(Model => Model.collection.deleteMany({})));
}
beforeEach(async () => { await Promise.all(services.splice(0).map(service => service.stop())); await clear();
  now = new Date(); calls = []; behavior = undefined; app = createApp({ paymentProvider: provider }); services.push(app.locals.refundService); });
after(async () => {
  try { await Promise.all(services.splice(0).map(service => service.stop())); if (ready && mongoose.connection.readyState === 1) await clear(); }
  finally { await disconnectDatabase(); }
});
async function actor(roles = ['admin']) {
  const user = await User.create({ name: 'Refund Actor', email: `${randomUUID()}@example.test`, roles,
    passwordHash: 'unused-test-hash', emailVerifiedAt: now });
  const familyId = randomUUID();
  await RefreshSession.create({ userId: user.id, familyId, tokenHash: randomUUID(), tokenVersion: 0,
    expiresAt: new Date(now.getTime() + 86400_000) });
  const auth = { userId: user.id, roles, familyId, tokenVersion: 0 };
  return { user, auth, token: await signAccessToken(auth) };
}
async function fixture({ admin, instructor, policy } = {}) {
  admin ??= await actor(); instructor ??= await actor(['instructor']);
  const student = await actor(['student']);
  policy ??= await FinancialPolicyVersion.create({ version: `test-${randomUUID()}`,
    effectiveFrom: new Date(now.getTime() - 19 * 86400_000), approvedAt: new Date(now.getTime() - 20 * 86400_000),
    refundWindowSeconds: 14 * 86400, refundMode: 'full', lateAdminOverrideAllowed: true,
    eligibilityRule: 'after_refund_window_without_holds', approvalSource: 'product_delegation', approvalReference: 'test-approval' });
  const confirmed = new Date(now.getTime() - 86400_000);
  const orderId = new mongoose.Types.ObjectId();
  const order = await Order.create({ _id: orderId, studentId: student.user.id, instructorId: instructor.user.id,
    courseId: new mongoose.Types.ObjectId(), courseTitleSnapshot: 'Refund Course', amountMinor: 1000, currency: 'EGP',
    commissionBps: 2000, platformAmountMinor: 200, instructorAmountMinor: 800, status: 'paid', paidAt: now,
    expiresAt: confirmed, policyVersionId: policy.id, refundWindowSeconds: 14 * 86400,
    paymentConfirmedAt: confirmed, refundDeadlineAt: new Date(confirmed.getTime() + 14 * 86400_000),
    createdAt: new Date(confirmed.getTime() - 3600_000) });
  const key = `checkout:${order.id}`;
  const payment = await Payment.create({ orderId: order.id, idempotencyKey: key, amountMinor: 1000, currency: 'EGP',
    status: 'succeeded', paidAt: now, paymentConfirmedAt: confirmed, paymentIntentId: `pi_${order.id}`,
    checkoutRequest: { orderId: order.id, courseTitle: 'Refund Course', amountMinor: 1000,
      customerEmail: student.user.email, idempotencyKey: key, expiresAtSeconds: Math.floor(confirmed.getTime() / 1000),
      successUrl: 'https://example.test/success', cancelUrl: 'https://example.test/cancel' } });
  const sale = await EarningEntry.create({ orderId: order.id, instructorId: instructor.user.id, type: 'sale',
    amountMinor: 800, currency: 'EGP', policyVersionId: policy.id });
  const enrollment = await Enrollment.create({ studentId: student.user.id, courseId: order.courseId,
    sourceOrderId: order.id, enrolledAt: confirmed });
  return { admin, instructor, student, policy, order, payment, sale, enrollment };
}
const path = f => `/api/v1/admin/orders/${f.order.id}/refunds`;
const post = (f, key = randomUUID(), input = { reason }) => request(app).post(path(f))
  .auth(f.admin.token, { type: 'bearer' }).set('Idempotency-Key', key).send(input);
const read = (path, who) => request(app).get(path).auth(who.token, { type: 'bearer' });
function newService(options = {}) {
  const service = createRefundService({ provider, clock: () => new Date(now), ...options }); services.push(service); return service;
}
const command = (f, key, input = { reason }) => ({ auth: f.admin.auth, orderId: f.order.id, idempotencyKey: key, input });
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; }

test('refund routes enforce current verified admin sessions, strict payloads/keys/queries and no-store errors', async () => {
  const f = await fixture();
  await request(app).post(path(f)).send({ reason }).expect(401);
  await request(app).post(path(f)).auth(f.student.token, { type: 'bearer' }).set('Idempotency-Key', randomUUID()).send({ reason }).expect(403);
  await request(app).post(path(f)).auth(f.admin.token, { type: 'bearer' }).send({ reason }).expect(400);
  for (const patch of [{ amountMinor: 1 }, { status: 'succeeded' }, { currency: 'USD' }, { initiatedBy: f.admin.user.id },
    { reason: 'short' }, { reason: `${reason}\n` }, { overrideWindow: 'true' }]) {
    const bad = await post(f, randomUUID(), { reason, ...patch }).expect(400);
    assert.equal(bad.headers['cache-control'], 'no-store');
  }
  await request(app).post(`${path(f)}?extra=x`).auth(f.admin.token, { type: 'bearer' })
    .set('Idempotency-Key', randomUUID()).send({ reason }).expect(400);
  const json = await request(app).post(path(f)).auth(f.admin.token, { type: 'bearer' }).set('Content-Type', 'application/json')
    .send('{broken').expect(400);
  assert.equal(json.headers['cache-control'], 'no-store');
  await read('/api/v1/admin/refunds?status=invalid', f.admin).expect(400);
  await read('/api/v1/admin/refunds/bad-id', f.admin).expect(400);
  assert.equal(await Refund.countDocuments(), 0); assert.equal(calls.length, 0);
});

test('accepted full refund persists frozen financial intent, hold and audit before a single provider call', async () => {
  const f = await fixture(); const key = randomUUID();
  const response = await post(f, key).expect(202);
  assert.equal(response.body.data.refund.status, 'requested');
  assert.equal(response.body.data.refund.amountMinor, 1000);
  assert.equal(response.headers['cache-control'], 'no-store');
  const stored = await Refund.findById(response.body.data.refund.id)
    .select('+providerIdempotencyKey +providerRefundId +providerStatus +paymentIntentId');
  assert.equal(stored.status, 'pending'); assert.equal(stored.providerStatus, 'pending');
  assert.equal(stored.paymentIntentId, `pi_${f.order.id}`);
  assert.notEqual(stored.providerIdempotencyKey, key);
  assert.equal(String(stored.policyVersionId), f.policy.id);
  assert.equal(stored.refundDeadlineAt.getTime(), f.order.refundDeadlineAt.getTime());
  assert.equal(await FinancialHold.countDocuments({ paymentId: f.payment.id, resolvedAt: null }), 1);
  assert.equal(await AdminAuditEvent.countDocuments({ action: 'refund.requested' }), 1);
  assert.equal(calls.length, 1);
  assert.equal((await Order.findById(f.order.id)).status, 'paid');
  assert.equal((await Payment.findById(f.payment.id)).status, 'succeeded');
  assert.equal((await Enrollment.findById(f.enrollment.id)).status, 'active');
  assert.equal((await EarningEntry.findById(f.sale.id)).status, 'pending');
});

test('identical key replay returns the original 202 after mutable state changes and never dispatches again', async () => {
  const f = await fixture(); const key = randomUUID();
  const first = await post(f, key).expect(202);
  await Refund.updateOne({ _id: first.body.data.refund.id }, { $set: { status: 'requires_reconciliation', failureCode: 'REFUND_PROVIDER_UNAVAILABLE' } });
  const repeated = await post(f, key).expect(202);
  assert.deepEqual(repeated.body, first.body); assert.equal(calls.length, 1);
  const current = await read(`/api/v1/admin/refunds/${first.body.data.refund.id}`, f.admin).expect(200);
  assert.equal(current.body.data.refund.status, 'requires_reconciliation');
  await post(f, key, { reason: `${reason} changed` }).expect(409);
  await post(f, randomUUID()).expect(409);
  assert.equal(await Refund.countDocuments(), 1);
});

test('parallel same-key requests return one receipt and one provider effect; competing admins cannot reserve two full refunds', async () => {
  const f = await fixture(); const key = randomUUID();
  const receipts = await Promise.all([newService(), newService(), newService()].map(service => service.create(command(f, key))));
  assert.equal(new Set(receipts.map(receipt => receipt.id)).size, 1);
  assert.equal(calls.length, 1);
  const other = await actor();
  await assert.rejects(newService().create({ ...command(f, randomUUID()), auth: other.auth }), { code: 'REFUND_IN_PROGRESS' });
  assert.equal(await Refund.countDocuments(), 1); assert.equal(await FinancialHold.countDocuments(), 1);
});

test('same actor/key across different instructors conflicts atomically, but equal headers from different actors use independent provider keys', async () => {
  const one = await fixture();
  const two = await fixture({ admin: one.admin, policy: one.policy });
  const key = randomUUID();
  const outcomes = await Promise.allSettled([newService().create(command(one, key)), newService().create(command(two, key))]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'IDEMPOTENCY_CONFLICT');
  const three = await fixture({ policy: one.policy });
  await newService().create(command(three, key));
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].providerIdempotencyKey, calls[1].providerIdempotencyKey);
});

test('holds are scoped to the payment so an unrelated refund for the same instructor can still be admitted', async () => {
  const one = await fixture(); const two = await fixture({ admin: one.admin, instructor: one.instructor, policy: one.policy });
  await newService().create(command(one, randomUUID())); await newService().create(command(two, randomUUID()));
  assert.equal(calls.length, 2); assert.equal(await FinancialHold.countDocuments(), 2);
});

test('legacy/mismatched financial snapshots and failed/cancelled/refunded orders are rejected before reservation/provider work', async () => {
  const f = await fixture();
  await Order.collection.updateOne({ _id: f.order._id }, { $set: { paymentConfirmedAt: null } });
  await assert.rejects(newService().create(command(f, randomUUID())), { code: 'FINANCIAL_RECONCILIATION_REQUIRED' });
  await Order.collection.updateOne({ _id: f.order._id }, { $set: { paymentConfirmedAt: f.order.paymentConfirmedAt } });
  for (const status of ['pending', 'failed', 'cancelled']) {
    await Order.updateOne({ _id: f.order.id }, { $set: { status } });
    await assert.rejects(newService().create(command(f, randomUUID())), { code: 'REFUND_NOT_ALLOWED' });
  }
  await Order.updateOne({ _id: f.order.id }, { $set: { status: 'refunded' } });
  await assert.rejects(newService().create(command(f, randomUUID())), { code: 'REFUND_ALREADY_COMPLETED' });
  assert.equal(await Refund.countDocuments(), 0); assert.equal(calls.length, 0);
});

test('expiry boundary requires an audited allowed override, which still uses the original price and split', async () => {
  const f = await fixture(); now = new Date(f.order.refundDeadlineAt);
  await RefreshSession.updateOne({ familyId: f.admin.auth.familyId }, { $set: { expiresAt: new Date(now.getTime() + 86400_000) } });
  await assert.rejects(newService().create(command(f, randomUUID())), { code: 'REFUND_WINDOW_EXPIRED' });
  await newService().create(command(f, randomUUID(), { reason, overrideWindow: true }));
  const refund = await Refund.findOne();
  assert.equal(refund.overrideWindow, true); assert.equal(refund.amountMinor, f.order.amountMinor);
  assert.equal((await AdminAuditEvent.findOne({ action: 'refund.requested' })).reason, reason);
});

test('an external partial refund or unresolved legacy/payment hold blocks a local full refund', async () => {
  const f = await fixture();
  await Refund.create({ orderId: f.order.id, paymentId: f.payment.id, instructorId: f.instructor.user.id,
    source: 'provider', kind: 'partial', amountMinor: 100, paymentAmountMinor: 1000, currency: 'EGP',
    providerRefundId: 're_external_partial', status: 'pending' });
  await assert.rejects(newService().create(command(f, randomUUID())), { code: 'FINANCIAL_RECONCILIATION_REQUIRED' });
  const other = await fixture({ admin: f.admin, instructor: f.instructor, policy: f.policy });
  const finance = createFinanceFoundationService({ clock: () => now });
  await finance.runForInstructor({ instructorId: f.instructor.user.id }, context => finance.openHold(context,
    { sourceType: 'legacy', sourceId: 'legacy-unmapped', reasonCode: 'LEGACY_REQUIRES_REVIEW' }));
  await assert.rejects(newService().create(command(other, randomUUID())), { code: 'FINANCIAL_RECONCILIATION_REQUIRED' });
  assert.equal(calls.length, 0);
});

test('provider timeout/lost response stays held for reconciliation; replay never repeats the external write', async () => {
  const f = await fixture(); const key = randomUUID();
  behavior = async () => { throw new Error('private raw Stripe token and request'); };
  const accepted = await newService().create(command(f, key));
  const stored = await Refund.findById(accepted.id);
  assert.equal(stored.status, 'requires_reconciliation'); assert.equal(stored.failureCode, 'REFUND_PROVIDER_UNAVAILABLE');
  assert.equal(await FinancialHold.countDocuments({ resolvedAt: null }), 1);
  assert.deepEqual(await newService().create(command(f, key)), accepted); assert.equal(calls.length, 1);
  const current = await read(`/api/v1/admin/refunds/${accepted.id}`, f.admin).expect(200);
  assert.equal(JSON.stringify(current.body).includes('private raw'), false);
});

test('even provider succeeded/failed responses await the S3-06 reducer without premature success, hold release or access revocation', async () => {
  const f = await fixture(); behavior = async input => ({ ...evidence(input), status: 'succeeded' });
  const accepted = await newService().create(command(f, randomUUID()));
  const stored = await Refund.findById(accepted.id).select('+providerStatus');
  assert.equal(stored.providerStatus, 'succeeded'); assert.equal(stored.status, 'pending');
  assert.equal(stored.completedAt, null);
  assert.equal((await Enrollment.findById(f.enrollment.id)).status, 'active');
  assert.equal(await FinancialHold.countDocuments({ resolvedAt: null }), 1);
});

test('audit failure rolls reservation/hold back before any SDK call or changed financial record', async t => {
  const f = await fixture();
  const failure = t.mock.method(AdminAuditEvent, 'create', async () => { throw new Error('audit write failure'); });
  try { await post(f).expect(500); } finally { failure.mock.restore(); }
  assert.equal(await Refund.countDocuments(), 0); assert.equal(await FinancialHold.countDocuments(), 0);
  assert.equal(calls.length, 0); assert.equal((await Order.findById(f.order.id)).status, 'paid');
});

test('persistence failure after a provider response still returns accepted and preserves a non-repeatable dispatch fence', async t => {
  const f = await fixture();
  const failure = t.mock.method(Refund, 'updateOne', async () => { throw new Error('provider binding persistence failure'); });
  const key = randomUUID(); let accepted;
  try { accepted = await newService().create(command(f, key)); } finally { failure.mock.restore(); }
  assert.equal((await Refund.findById(accepted.id)).status, 'processing');
  await newService().create(command(f, key)); assert.equal(calls.length, 1);
  const issuance = createRefundIssuanceService({ provider, finance: createFinanceFoundationService({ clock: () => now }), shutdownSignal: new AbortController().signal });
  assert.equal(await issuance.issue({ refundId: accepted.id, instructorId: f.instructor.user.id }), false);
  assert.equal(calls.length, 1);
});

test('stale lease or response association cannot overwrite a newer worker or bind another refund', async () => {
  const f = await fixture(); behavior = async input => {
    await Refund.updateOne({ _id: input.refundId }, { $set: { leaseId: randomUUID() } });
    return evidence(input);
  };
  const accepted = await newService().create(command(f, randomUUID()));
  assert.equal((await Refund.findById(accepted.id).select('+providerRefundId')).providerRefundId, null);
  assert.equal((await Refund.findById(accepted.id)).status, 'processing');
});

test('shutdown is bounded, rejects new admission and ignores a late provider result without clearing its hold', async () => {
  const f = await fixture(); const started = deferred(); const finish = deferred();
  behavior = async input => { started.resolve(); await finish.promise; return evidence(input); };
  const service = newService({ shutdownTimeoutMs: 30 });
  const request = service.create(command(f, randomUUID()));
  await started.promise; await service.stop();
  const accepted = await request;
  await assert.rejects(service.create(command(f, randomUUID())), { code: 'SERVICE_SHUTTING_DOWN' });
  finish.resolve(); await new Promise(resolve => setImmediate(resolve));
  const stored = await Refund.findById(accepted.id).select('+providerRefundId');
  assert.equal(stored.status, 'processing'); assert.equal(stored.providerRefundId, null);
  assert.equal(await FinancialHold.countDocuments({ resolvedAt: null }), 1);
});

test('operation deadline produces reconciliation and ignores an eventual response after timeout', async () => {
  const f = await fixture(); const finish = deferred();
  behavior = async input => { await finish.promise; return evidence(input); };
  const accepted = await newService({ operationTimeoutMs: 30 }).create(command(f, randomUUID()));
  assert.equal((await Refund.findById(accepted.id)).status, 'requires_reconciliation');
  finish.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal((await Refund.findById(accepted.id).select('+providerRefundId')).providerRefundId, null);
});

test('read DTOs are admin-only and filter-bound cursor pages contain no provider IDs, keys, reason, leases or raw evidence', async () => {
  const one = await fixture(); const two = await fixture({ admin: one.admin, instructor: one.instructor, policy: one.policy });
  await newService().create(command(one, randomUUID())); await newService().create(command(two, randomUUID()));
  const first = await read('/api/v1/admin/refunds?status=pending&limit=1', one.admin).expect(200);
  assert.equal(first.body.data.pagination.hasMore, true);
  const cursor = first.body.data.pagination.nextCursor;
  const second = await read(`/api/v1/admin/refunds?status=pending&limit=1&cursor=${cursor}`, one.admin).expect(200);
  assert.equal(second.body.data.pagination.hasMore, false);
  assert.notEqual(first.body.data.refunds[0].id, second.body.data.refunds[0].id);
  await read(`/api/v1/admin/refunds?status=failed&cursor=${cursor}`, one.admin).expect(400);
  await read('/api/v1/admin/refunds', one.student).expect(403);
  await read(`/api/v1/admin/refunds/${new mongoose.Types.ObjectId()}`, one.admin).expect(404);
  const serialized = JSON.stringify(first.body);
  for (const forbidden of ['providerRefundId', 'paymentIntentId', 'providerIdempotencyKey', 'reason', 'leaseId', 'requestFingerprint']) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.equal(first.headers['cache-control'], 'no-store');
});

test('fresh admin checks remain authoritative on replay and suspension of the instructor does not erase refund obligations', async () => {
  const f = await fixture();
  await User.updateOne({ _id: f.instructor.user.id }, { $set: { status: 'suspended' } });
  const key = randomUUID(); await newService().create(command(f, key));
  await User.updateOne({ _id: f.admin.user.id }, { $set: { roles: ['student'] } });
  await assert.rejects(newService().create(command(f, key)), { code: 'INSUFFICIENT_PERMISSIONS' });
  assert.equal(calls.length, 1);
});

test('a mismatched provider response is held for review without binding the foreign refund identity', async () => {
  const f = await fixture(); behavior = async input => ({ ...evidence(input), paymentId: String(new mongoose.Types.ObjectId()) });
  const accepted = await newService().create(command(f, randomUUID()));
  const row = await Refund.findById(accepted.id).select('+providerRefundId');
  assert.equal(row.status, 'requires_reconciliation'); assert.equal(row.failureCode, 'REFUND_EVIDENCE_MISMATCH');
  assert.equal(row.providerRefundId, null);
  assert.equal(await FinancialHold.countDocuments({ resolvedAt: null }), 1);
});

test('a removed financial hold prevents a deferred issuer from starting provider work', async t => {
  const f = await fixture();
  const failedClaim = t.mock.method(Refund, 'findOneAndUpdate', () => { throw new Error('deferred issuer'); });
  let accepted;
  try { accepted = await newService().create(command(f, randomUUID())); } finally { failedClaim.mock.restore(); }
  assert.equal((await Refund.findById(accepted.id)).status, 'requested');
  await FinancialHold.collection.deleteMany({ paymentId: f.payment._id }); // Explicit isolated fixture corruption.
  const issuance = createRefundIssuanceService({ provider, finance: createFinanceFoundationService({ clock: () => now }),
    shutdownSignal: new AbortController().signal });
  await assert.rejects(issuance.issue({ refundId: accepted.id, instructorId: f.instructor.user.id }), { code: 'FINANCIAL_HOLD_REQUIRED' });
  assert.equal(calls.length, 0);
  assert.equal((await Refund.findById(accepted.id)).status, 'requested');
});

test('refund write/read quotas are shared across targets and storage failure happens before a financial reservation', async () => {
  const f = await fixture(); let fail = false; const counts = new Map();
  app = createApp({ paymentProvider: provider, rateLimitStoreFactory: namespace => {
    if (!namespace.startsWith('admin-refunds-')) return undefined;
    return { localKeys: true, async increment(key) {
      assert.equal(key, f.admin.user.id);
      if (fail) throw new Error('private quota backend failure');
      const count = (counts.get(namespace) ?? 0) + 1; counts.set(namespace, count);
      return { totalHits: count === 1 ? 1 : 10000, resetTime: new Date(Date.now() + 60000) };
    }, async decrement() {}, async resetKey() {} };
  } }); services.push(app.locals.refundService);
  await read('/api/v1/admin/refunds', f.admin).expect(200);
  const limitedRead = await read(`/api/v1/admin/refunds/${new mongoose.Types.ObjectId()}`, f.admin).expect(429);
  assert.ok(limitedRead.headers['retry-after']);
  await post(f).expect(202);
  const limitedWrite = await post(f).expect(429);
  assert.equal(limitedWrite.headers['cache-control'], 'no-store');
  fail = true;
  const failed = await post(f).expect(503);
  assert.equal(failed.body.error.code, 'RATE_LIMIT_UNAVAILABLE');
  assert.equal(await Refund.countDocuments(), 1); assert.equal(calls.length, 1);
});

test('normal checkout and signed webhook fulfillment fail closed on refund admission until G03 policy/confirmation snapshot is attached', async () => {
  const admin = await actor();
  const instructor = await actor(['instructor']);
  const student = await actor(['student']);
  await FinancialPolicyVersion.create({ version: `test-${randomUUID()}`,
    effectiveFrom: new Date(now.getTime() - 19 * 86400_000), approvedAt: new Date(now.getTime() - 20 * 86400_000),
    refundWindowSeconds: 14 * 86400, refundMode: 'full', lateAdminOverrideAllowed: true,
    eligibilityRule: 'after_refund_window_without_holds', approvalSource: 'product_delegation', approvalReference: 'test-approval' });
  const category = await Category.create({ name: 'Checkout Refund Flow', slug: `checkout-refund-${randomUUID()}` });
  const course = await Course.create({ instructorId: instructor.user.id, categoryId: category.id,
    title: 'Checkout to Refund Course', slug: `checkout-refund-course-${randomUUID()}`,
    description: 'Course purchased through normal checkout and webhook fulfillment.',
    priceMinor: 1000, status: 'published', publishedAt: now });

  const webhookSecret = 'whsec_refund_flow_fixture';
  const sdk = new Stripe('sk_test_refund_flow_fixture');
  const sessions = new Map();
  const stripeProvider = createStripePaymentProvider({
    secretKey: 'sk_test_refund_flow_fixture', webhookSecret,
    successUrl: 'https://example.test/success', cancelUrl: 'https://example.test/cancel',
    refundIssuanceEnabled: true,
    stripeClient: {
      webhooks: sdk.webhooks,
      paymentIntents: { async retrieve() { throw new Error('must not be called before reservation'); } },
      refunds: { async list() { return { data: [], has_more: false }; }, async create() { calls.push('stripe'); } },
      checkout: { sessions: {
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
        async retrieve(id) { return sessions.get(id); },
      } },
    },
  });

  const checkout = createCheckoutService({ provider: stripeProvider, clock: () => new Date(now) });
  let checkoutResult;
  try { checkoutResult = await checkout.checkout({ studentId: student.user.id, courseId: course.id }); }
  finally { await checkout.stop(); }

  const orderId = checkoutResult.data.order.id;
  const rawSession = sessions.get(`cs_test_${orderId}`);
  Object.assign(rawSession, { status: 'complete', payment_status: 'paid', payment_intent: {
    id: `pi_${orderId}`, livemode: false, status: 'succeeded',
    amount: rawSession.amount_total, amount_received: rawSession.amount_total,
    currency: rawSession.currency, metadata: rawSession.metadata,
  } });

  const inbox = createPaymentInboxService({ provider: stripeProvider, clock: () => new Date(now) });
  const rawEvent = Buffer.from(JSON.stringify({ id: 'evt_checkout_paid', type: 'checkout.session.completed',
    livemode: false, created: Math.floor(now.getTime() / 1000), data: { object: structuredClone(rawSession) } }));
  const signature = sdk.webhooks.generateTestHeaderString({ payload: rawEvent.toString(), secret: webhookSecret });
  await inbox.receive({ rawBody: rawEvent, signature });

  const webhookWorker = createPaymentWebhookWorker({ provider: stripeProvider, clock: () => new Date(now), shutdownTimeoutMs: 50 });
  try { assert.equal(await webhookWorker.processNext(), true); }
  finally { await webhookWorker.stop(); }

  const fulfilledOrder = await Order.findById(orderId).lean();
  const fulfilledPayment = await Payment.findOne({ orderId }).select('+paymentIntentId').lean();
  const fulfilledSale = await EarningEntry.findOne({ orderId, type: 'sale' }).lean();
  const fulfilledEnrollment = await Enrollment.findOne({ studentId: student.user.id, courseId: course.id }).lean();

  assert.equal(fulfilledOrder.status, 'paid');
  assert.ok(fulfilledOrder.paidAt instanceof Date);
  assert.equal(fulfilledOrder.policyVersionId, null);
  assert.equal(fulfilledOrder.refundWindowSeconds, null);
  assert.equal(fulfilledOrder.paymentConfirmedAt, null);
  assert.equal(fulfilledOrder.refundDeadlineAt, null);

  assert.equal(fulfilledPayment.status, 'succeeded');
  assert.equal(fulfilledPayment.paymentIntentId, `pi_${orderId}`);
  assert.equal(fulfilledPayment.paymentConfirmedAt, null);

  assert.equal(fulfilledSale.status, 'pending');
  assert.equal(fulfilledSale.policyVersionId, null);
  assert.equal(fulfilledSale.eligibleAt, null);
  assert.equal(fulfilledEnrollment.status, 'active');

  const diagnostic = await inspectFinancialFoundation();
  assert.deepEqual(diagnostic.findings, [{
    orderId,
    reasonCodes: ['MISSING_POLICY', 'MISSING_CONFIRMATION', 'DEADLINE_REQUIRES_REVIEW'],
  }]);

  await assert.rejects(
    newService({ provider: stripeProvider }).create({ auth: admin.auth, orderId, idempotencyKey: randomUUID(), input: { reason } }),
    { statusCode: 409, code: 'FINANCIAL_RECONCILIATION_REQUIRED' },
  );
  assert.equal(await Refund.countDocuments(), 0);
  assert.equal(await FinancialHold.countDocuments(), 0);
  assert.equal(calls.length, 0);
});
