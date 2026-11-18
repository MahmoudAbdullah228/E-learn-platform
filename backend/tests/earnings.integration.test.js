import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';

import mongoose from 'mongoose';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { assertTransactionSupport } from '../src/config/transactions.js';
import { AdminAuditEvent } from '../src/models/AdminAuditEvent.js';
import { EarningEntry } from '../src/models/EarningEntry.js';
import { Enrollment } from '../src/models/Enrollment.js';
import { FinancialHold } from '../src/models/FinancialHold.js';
import { FinancialPolicyVersion } from '../src/models/FinancialPolicyVersion.js';
import { InstructorFinanceState } from '../src/models/InstructorFinanceState.js';
import { Order } from '../src/models/Order.js';
import { Payment } from '../src/models/Payment.js';
import { Payout } from '../src/models/Payout.js';
import { PayoutItem } from '../src/models/PayoutItem.js';
import { Refund } from '../src/models/Refund.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { User } from '../src/models/User.js';
import { WebhookEvent } from '../src/models/WebhookEvent.js';
import { createEarningsEligibilityService } from '../src/modules/earnings/eligibility.service.js';
import { createEligibilityBalanceService } from '../src/modules/earnings/eligibilityBalance.service.js';
import { createFinanceFoundationService } from '../src/modules/finance/finance.service.js';
import { createRefundReservationService } from '../src/modules/refunds/refundReservation.service.js';
import { createRefundInboxService } from '../src/modules/refunds/refundInbox.service.js';
import { createEarningsEligibilityWorker } from '../src/services/earningsEligibilityWorker.service.js';
import { createPaymentWebhookWorker } from '../src/services/paymentWebhookWorker.service.js';
import { createPayoutService } from '../src/modules/payouts/payout.service.js';
import { payoutPeriodSchema } from '../src/modules/payouts/payout.schemas.js';
import { signAccessToken } from '../src/utils/sessionToken.js';

const models = [AdminAuditEvent, EarningEntry, Enrollment, FinancialHold, FinancialPolicyVersion, InstructorFinanceState,
  Order, Payment, Payout, PayoutItem, Refund, RefreshSession, User, WebhookEvent];
let ready = false; let now; let sequence; const workers = [];
const clock = () => new Date(now);
before(async () => {
  await connectDatabase({ maxRetries: 1 }); assert.match(mongoose.connection.name, /_test$/);
  await assertTransactionSupport(); await Promise.all(models.map(Model => Model.init())); ready = true;
});
async function clear() {
  assert.ok(ready && mongoose.connection.readyState === 1); assert.match(mongoose.connection.name, /_test$/);
  await Promise.all(models.map(Model => Model.collection.deleteMany({})));
}
beforeEach(async () => { await Promise.all(workers.splice(0).map(worker => worker.stop())); await clear(); now = new Date(); sequence = 0; });
after(async () => {
  try { await Promise.all(workers.splice(0).map(worker => worker.stop())); if (ready && mongoose.connection.readyState === 1) await clear(); }
  finally { await disconnectDatabase(); }
});
async function fixture({ instructor, policy, confirmed = new Date(now.getTime() - 15 * 86400_000), missingDate = false, amount = 1000 } = {}) {
  instructor ??= await User.create({ name: 'Earnings instructor', email: `${randomUUID()}@example.test`, roles: ['instructor'], passwordHash: 'unused-test-hash' });
  policy ??= await FinancialPolicyVersion.create({ version: `v-${randomUUID()}`,
    effectiveFrom: new Date(now.getTime() - 365 * 86400_000 + ++sequence * 1000), approvedAt: new Date(now.getTime() - 366 * 86400_000),
    refundWindowSeconds: 14 * 86400, refundMode: 'full', lateAdminOverrideAllowed: true,
    eligibilityRule: 'after_refund_window_without_holds', approvalSource: 'product_delegation', approvalReference: 'test-approval' });
  const platformAmountMinor = Math.floor(amount / 5); const deadline = new Date(confirmed.getTime() + policy.refundWindowSeconds * 1000);
  const order = await Order.create({ studentId: new mongoose.Types.ObjectId(), courseId: new mongoose.Types.ObjectId(), instructorId: instructor.id,
    courseTitleSnapshot: 'Earnings course', amountMinor: amount, currency: 'EGP', commissionBps: 2000,
    platformAmountMinor, instructorAmountMinor: amount - platformAmountMinor, status: 'paid', paidAt: now,
    createdAt: new Date(confirmed.getTime() - 60_000), expiresAt: new Date(confirmed.getTime() + 1800_000),
    policyVersionId: policy.id, refundWindowSeconds: policy.refundWindowSeconds, paymentConfirmedAt: confirmed, refundDeadlineAt: deadline });
  const key = `checkout:${order.id}`;
  const payment = await Payment.create({ orderId: order.id, idempotencyKey: key, amountMinor: amount, currency: 'EGP', status: 'succeeded',
    paidAt: now, paymentConfirmedAt: confirmed, paymentIntentId: `pi_${order.id}`, checkoutRequest: { orderId: order.id, courseTitle: 'Earnings course',
      amountMinor: amount, customerEmail: 'student@example.test', idempotencyKey: key, expiresAtSeconds: Math.floor(confirmed.getTime() / 1000),
      successUrl: 'https://example.test/success', cancelUrl: 'https://example.test/cancel' } });
  const sale = await EarningEntry.create({ instructorId: instructor.id, orderId: order.id, type: 'sale', amountMinor: order.instructorAmountMinor,
    currency: 'EGP', policyVersionId: policy.id, eligibleAt: missingDate ? null : deadline });
  return { instructor, policy, order, payment, sale, deadline };
}
function worker(options = {}) { const result = createEarningsEligibilityWorker({ clock, shutdownTimeoutMs: 30, ...options }); workers.push(result); return result; }
const stored = id => EarningEntry.findById(id).select('+eligibilityCheckCode +eligibilityNextCheckAt +eligibilityLeaseId +eligibilityLeaseUntil +eligibilityAttempts');
async function claimed(f, duration = 120_000) {
  const leaseId = randomUUID();
  await EarningEntry.updateOne({ _id: f.sale.id }, { $set: { eligibilityLeaseId: leaseId, eligibilityLeaseUntil: new Date(now.getTime() + duration) } });
  return { entryId: f.sale.id, leaseId };
}
async function hold(f, sourceType = 'operations') {
  const finance = createFinanceFoundationService({ clock }); let result;
  await finance.runForInstructor({ instructorId: f.instructor.id }, async context => {
    result = await finance.openHold(context, { sourceType, sourceId: randomUUID(), paymentId: f.payment.id, reasonCode: 'TEST_HOLD_ACTIVE' });
  }); return { finance, result };
}
async function event(f, { associated = true, status = 'pending' } = {}) {
  return WebhookEvent.create({ eventId: `evt_${randomUUID().replaceAll('-', '')}`, eventType: 'refund.updated', status,
    paymentIntentId: associated ? `pi_${f.order.id}` : null, payload: { kind: 'refund', paymentIntentId: associated ? `pi_${f.order.id}` : null },
    lastReceivedAt: now, availableAt: now });
}
const balance = f => createEligibilityBalanceService({ clock }).inspect({ instructorId: f.instructor.id });

test('eligibility waits until the exact UTC deadline and makes a single audited transition across concurrent workers', async () => {
  const f = await fixture({ confirmed: new Date(now.getTime() - 14 * 86400_000 + 1) });
  const left = worker(); const right = worker(); assert.equal(await left.processNext(), false);
  now = new Date(now.getTime() + 1); await Promise.all([left.processNext(), right.processNext()]);
  const row = await stored(f.sale.id); assert.equal(row.status, 'eligible'); assert.equal(row.eligibleAt.getTime(), f.deadline.getTime());
  assert.equal(await AdminAuditEvent.countDocuments({ action: 'earning.eligible', targetId: f.sale.id }), 1);
  assert.equal(await left.processNext(), false); assert.equal((await balance(f)).netEligibleMinor, 800);
});
test('dated backfill uses only matching frozen proof, including a future deadline, without moving existing dates', async () => {
  const f = await fixture({ missingDate: true, confirmed: new Date(now.getTime() - 13 * 86400_000) });
  await worker().processNext(); let row = await stored(f.sale.id);
  assert.equal(row.status, 'pending'); assert.equal(row.eligibleAt.getTime(), f.deadline.getTime()); assert.equal(row.eligibilityCheckCode, 'REFUND_WINDOW_OPEN');
  now = new Date(f.deadline); await worker().processNext(); row = await stored(f.sale.id);
  assert.equal(row.status, 'eligible'); assert.equal(row.eligibleAt.getTime(), f.deadline.getTime());
});
test('a later active policy does not change an existing sale deadline or original revenue snapshot', async () => {
  const f = await fixture();
  await FinancialPolicyVersion.create({ version: 'new-policy', effectiveFrom: now, approvedAt: now, refundWindowSeconds: 3600,
    refundMode: 'full', lateAdminOverrideAllowed: false, eligibilityRule: 'after_refund_window_without_holds',
    approvalSource: 'product_delegation', approvalReference: 'test-new-policy' });
  await worker().processNext(); const row = await stored(f.sale.id);
  assert.equal(String(row.policyVersionId), f.policy.id); assert.equal(row.eligibleAt.getTime(), f.deadline.getTime());
  assert.equal(row.amountMinor, 800); assert.equal((await Order.findById(f.order.id)).refundWindowSeconds, 14 * 86400);
});
test('unresolved financial holds defer eligibility and explicit recheck after audited resolution can promote it', async () => {
  const f = await fixture(); const { finance, result } = await hold(f, 'payout'); await worker().processNext();
  assert.equal((await stored(f.sale.id)).eligibilityCheckCode, 'FINANCIAL_HOLD_ACTIVE'); assert.equal((await stored(f.sale.id)).status, 'pending');
  await finance.runForInstructor({ instructorId: f.instructor.id }, context => finance.resolveHold(context, { holdId: result.id, resolutionCode: 'TEST_REVIEW_COMPLETED' }));
  await worker().processNext({ entryId: f.sale.id }); assert.equal((await stored(f.sale.id)).status, 'eligible');
});
test('unprocessed or failed associated financial inbox jobs block readiness even when their hold is missing', async () => {
  const f = await fixture(); const pendingEvent = await event(f, { status: 'failed' });
  await worker().processNext(); assert.equal((await stored(f.sale.id)).eligibilityCheckCode, 'FINANCIAL_EVENT_PENDING');
  await WebhookEvent.updateOne({ _id: pendingEvent.id }, { $set: { status: 'processed', processedAt: now } });
  await worker().processNext({ entryId: f.sale.id }); assert.equal((await stored(f.sale.id)).status, 'eligible');
});
test('unassociated financial receipts conservatively block eligibility across instructors until classified', async () => {
  const first = await fixture(); const second = await fixture(); await event(first, { associated: false });
  const current = worker(); await current.processNext(); await current.processNext();
  assert.equal((await stored(first.sale.id)).status, 'pending'); assert.equal((await stored(second.sale.id)).status, 'pending');
  assert.equal((await balance(first)).blocked, true);
});
test('unresolved refund records are held instead of promoting a sale when refund-hold evidence is missing', async () => {
  const f = await fixture(); await Refund.create({ orderId: f.order.id, paymentId: f.payment.id, instructorId: f.instructor.id,
    source: 'provider', providerRefundId: 're_pending', kind: 'full', status: 'pending', amountMinor: 1000, paymentAmountMinor: 1000, currency: 'EGP' });
  await worker().processNext(); assert.equal((await stored(f.sale.id)).eligibilityCheckCode, 'REFUND_UNRESOLVED');
  assert.equal(await FinancialHold.countDocuments({ resolvedAt: null }), 1); assert.equal((await balance(f)).blocked, true);
});
test('legacy paidAt does not activate earnings; repeated review creates one durable hold and no mapping', async () => {
  const f = await fixture({ missingDate: true });
  await Order.collection.updateOne({ _id: f.order._id }, { $set: { policyVersionId: null, refundWindowSeconds: null, paymentConfirmedAt: null, refundDeadlineAt: null } });
  await EarningEntry.collection.updateOne({ _id: f.sale._id }, { $set: { policyVersionId: null } });
  const current = worker(); await current.processNext(); await current.processNext({ entryId: f.sale.id });
  const row = await stored(f.sale.id); assert.equal(row.status, 'pending'); assert.equal(row.eligibleAt, null);
  assert.equal(row.eligibilityCheckCode, 'EARNINGS_LEGACY_REQUIRES_REVIEW'); assert.equal(row.policyVersionId, null);
  assert.equal(await FinancialHold.countDocuments({ sourceType: 'legacy', resolvedAt: null }), 1);
});

test('an improperly resolved review hold creates one new incident without reopening or duplicating history', async () => {
  const f = await fixture({ missingDate: true });
  await Order.collection.updateOne({ _id: f.order._id }, { $set: { paymentConfirmedAt: null } });
  const current = worker(); await current.processNext(); const original = await FinancialHold.findOne();
  const finance = createFinanceFoundationService({ clock });
  await finance.runForInstructor({ instructorId: f.instructor.id }, context => finance.resolveHold(context,
    { holdId: original.id, resolutionCode: 'TEST_OPERATOR_REVIEW' }));
  await current.processNext({ entryId: f.sale.id }); await current.processNext({ entryId: f.sale.id });
  assert.equal(await FinancialHold.countDocuments(), 2); assert.equal(await FinancialHold.countDocuments({ resolvedAt: null }), 1);
  assert.ok((await FinancialHold.findById(original.id)).resolvedAt);
});
test('mismatched persisted deadline is retained for review rather than repaired or released', async () => {
  const f = await fixture(); const wrong = new Date(f.deadline.getTime() - 1000);
  await EarningEntry.collection.updateOne({ _id: f.sale._id }, { $set: { eligibleAt: wrong } });
  await worker().processNext(); const row = await stored(f.sale.id);
  assert.equal(row.status, 'pending'); assert.equal(row.eligibleAt.getTime(), wrong.getTime());
  assert.equal(row.eligibilityCheckCode, 'EARNINGS_EVIDENCE_REQUIRES_REVIEW'); assert.equal(await FinancialHold.countDocuments({ resolvedAt: null }), 1);
});
test('held and legacy candidates are deferred so later due sales are not starved', async () => {
  const blocked = await fixture({ missingDate: true }); await hold(blocked);
  const healthy = await fixture(); const current = worker(); await current.processNext(); await current.processNext();
  assert.equal((await stored(blocked.sale.id)).status, 'pending'); assert.equal((await stored(healthy.sale.id)).status, 'eligible');
});
test('suspended or deapproved instructors retain the same accounting eligibility obligations', async () => {
  const f = await fixture(); await User.updateOne({ _id: f.instructor.id }, { $set: { status: 'suspended', roles: ['student'], instructorStatus: 'rejected' } });
  await worker().processNext(); assert.equal((await stored(f.sale.id)).status, 'eligible'); assert.equal((await balance(f)).netEligibleMinor, 800);
});
test('a stale lease cannot commit eligibility or audit, while a restarted worker recovers it', async () => {
  const f = await fixture(); const stale = await claimed(f, -1);
  await assert.rejects(createEarningsEligibilityService({ clock }).evaluate(stale), { code: 'EARNINGS_ELIGIBILITY_LEASE_LOST' });
  await worker().processNext(); assert.equal((await stored(f.sale.id)).status, 'eligible');
  assert.equal(await AdminAuditEvent.countDocuments({ action: 'earning.eligible' }), 1);
});
test('lease expiration at final commit rolls back eligibility, owned review holds and audit atomically', async () => {
  const f = await fixture({ missingDate: true }); const claim = await claimed(f, 1000); let reads = 0;
  const service = createEarningsEligibilityService({ clock: () => new Date(now.getTime() + (++reads >= 3 ? 2000 : 0)) });
  await assert.rejects(service.evaluate(claim), { code: 'EARNINGS_ELIGIBILITY_LEASE_LOST' });
  assert.equal((await stored(f.sale.id)).status, 'pending'); assert.equal((await stored(f.sale.id)).eligibleAt, null);
  assert.equal(await AdminAuditEvent.countDocuments({ action: 'earning.eligible' }), 0);
  const legacy = await fixture({ missingDate: true });
  await Order.collection.updateOne({ _id: legacy.order._id }, { $set: { paymentConfirmedAt: null } });
  const legacyClaim = await claimed(legacy, 1000); reads = 0;
  await assert.rejects(service.evaluate(legacyClaim), { code: 'EARNINGS_ELIGIBILITY_LEASE_LOST' });
  assert.equal(await FinancialHold.countDocuments(), 0);
  assert.equal(await AdminAuditEvent.countDocuments({ action: 'financial_hold.opened' }), 0);
});
test('worker shutdown leaves its claim for recovery and ignores a delayed evaluation', async () => {
  const f = await fixture(); let release; let entered; const started = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { release = resolve; }); const real = createEarningsEligibilityService({ clock });
  const current = worker({ service: { async evaluate(input, options) { entered(); await wait; return real.evaluate(input, options); } } });
  const processing = current.processNext(); await started; await current.stop(); release(); await processing;
  assert.equal((await stored(f.sale.id)).status, 'pending'); assert.ok((await stored(f.sale.id)).eligibilityLeaseUntil);
  assert.equal(await AdminAuditEvent.countDocuments({ action: 'earning.eligible' }), 0);
});

test('unexpected evaluation errors keep a safe retry state and do not starve another instructor', async () => {
  const first = await fixture(); const second = await fixture(); const real = createEarningsEligibilityService({ clock });
  const current = worker({ service: { async evaluate(input, options) {
    if (input.entryId === first.sale.id) throw new Error('private database details');
    return real.evaluate(input, options);
  } } });
  await current.processNext(); await current.processNext(); const failed = await stored(first.sale.id);
  assert.equal(failed.status, 'pending'); assert.equal(failed.eligibilityCheckCode, 'EARNINGS_EVALUATION_UNAVAILABLE');
  assert.ok(failed.eligibilityNextCheckAt > now); assert.equal(failed.eligibilityLeaseId, null);
  assert.equal((await stored(second.sale.id)).status, 'eligible');
});

test('orphan financial accounts remain pending for review without creating a new identity or losing history', async () => {
  const f = await fixture(); await User.deleteOne({ _id: f.instructor.id }); await worker().processNext();
  assert.equal((await stored(f.sale.id)).eligibilityCheckCode, 'EARNINGS_ACCOUNT_REQUIRES_REVIEW');
  assert.equal((await stored(f.sale.id)).status, 'pending'); assert.equal(await InstructorFinanceState.countDocuments(), 0);
  await assert.rejects(balance(f), { code: 'FINANCIAL_ACCOUNT_NOT_FOUND' });
});
test('refund admission racing eligibility remains serialized and leaves no releasable unheld balance', async () => {
  const f = await fixture({ confirmed: new Date(now.getTime() - 14 * 86400_000) });
  const admin = await User.create({ name: 'Refund admin', email: 'admin@example.test', passwordHash: 'unused-test-hash', roles: ['admin'], emailVerifiedAt: now });
  const familyId = randomUUID(); await RefreshSession.create({ userId: admin.id, familyId, tokenHash: randomUUID(), tokenVersion: 0, expiresAt: new Date(now.getTime() + 86400_000) });
  const reserve = createRefundReservationService({ provider: { assertRefundReady() {} }, finance: createFinanceFoundationService({ clock }),
    clock, signal: new AbortController().signal });
  await Promise.all([worker().processNext(), reserve({ auth: { userId: admin.id, roles: ['admin'], familyId, tokenVersion: 0 },
    orderId: f.order.id, idempotencyKey: randomUUID(), input: { reason: 'Documented late refund after customer review', overrideWindow: true } })]);
  assert.equal(await Refund.countDocuments(), 1); assert.equal(await FinancialHold.countDocuments({ resolvedAt: null }), 1);
  assert.equal((await balance(f)).blocked, true); assert.ok(['pending', 'eligible'].includes((await stored(f.sale.id)).status));
});
test('a successful refund winning after a worker claim prevents that worker from resurrecting the reversed sale', async () => {
  const f = await fixture(); let release; let entered; const started = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { release = resolve; }); const real = createEarningsEligibilityService({ clock });
  const current = worker({ service: { async evaluate(input, options) { entered(); await wait; return real.evaluate(input, options); } } });
  const processing = current.processNext(); await started;
  const observation = { kind: 'refund', providerRefundId: 're_winner', paymentIntentId: `pi_${f.order.id}`, amountMinor: 1000,
    currency: 'EGP', providerStatus: 'succeeded', providerCreatedAt: now, correlation: null, metadataConflict: false,
    payment: { id: `pi_${f.order.id}`, amountMinor: 1000, amountReceivedMinor: 1000, currency: 'EGP', orderId: f.order.id, status: 'succeeded', livemode: false } };
  await createRefundInboxService({ clock }).recordObservation(observation);
  const refundWorker = createPaymentWebhookWorker({ clock, provider: { async retrieveRefundObservation() { return observation; } } }); workers.push(refundWorker);
  await refundWorker.processNext(); release(); await processing;
  assert.equal((await stored(f.sale.id)).status, 'reversed'); assert.equal(await AdminAuditEvent.countDocuments({ action: 'earning.eligible' }), 0);
});

async function debt(f, { pending = false, occurredAt = new Date(now.getTime() - 90 * 86400_000) } = {}) {
  const payout = await Payout.create({ instructorId: f.instructor.id, amountMinor: f.order.instructorAmountMinor, currency: 'EGP', lineCount: 1,
    periodStart: new Date(occurredAt.getTime() - 2 * 86400_000), periodEnd: occurredAt, cutoffAt: occurredAt, createdBy: f.instructor.id,
    idempotencyKey: randomUUID(), requestFingerprint: 'a'.repeat(64), status: pending ? 'pending' : 'paid',
    sealedAt: new Date(occurredAt.getTime() - 86400_000), sealedBy: f.instructor.id, transferAttemptId: randomUUID(), transferMethod: 'test_simulation',
    transferOutcome: pending ? 'unknown' : 'confirmed_paid', ...(pending ? {} : { paidAt: occurredAt, paidBy: f.instructor.id, transferReference: randomUUID() }) });
  await PayoutItem.create({ payoutId: payout.id, earningEntryId: f.sale.id, instructorId: f.instructor.id, type: 'sale', amountMinor: f.sale.amountMinor, currency: 'EGP' });
  await EarningEntry.updateOne({ _id: f.sale.id }, { $set: { status: 'included_in_payout', payoutId: payout.id } });
  await Order.updateOne({ _id: f.order.id }, { $set: { status: 'refunded', purchaseSlotActive: false } });
  await Payment.updateOne({ _id: f.payment.id }, { $set: { status: 'refunded' } });
  const refund = await Refund.create({ orderId: f.order.id, paymentId: f.payment.id, instructorId: f.instructor.id, source: 'provider',
    kind: 'full', amountMinor: f.order.amountMinor, paymentAmountMinor: f.order.amountMinor, currency: 'EGP', status: 'succeeded',
    providerRefundId: `re_${f.order.id}`, completedAt: occurredAt });
  const adjustment = await EarningEntry.create({ instructorId: f.instructor.id, orderId: f.order.id, refundId: refund.id,
    type: 'refund_adjustment', amountMinor: -f.sale.amountMinor, currency: 'EGP', policyVersionId: f.policy.id,
    status: pending ? 'pending' : 'eligible', eligibleAt: pending ? null : occurredAt, dependentOnPayoutId: pending ? payout.id : null,
    createdAt: occurredAt });
  return { payout, adjustment };
}
test('an old negative adjustment is carried into the current signed balance without a period-start filter', async () => {
  const old = await fixture({ confirmed: new Date(now.getTime() - 120 * 86400_000), amount: 2000 }); await debt(old);
  const recent = await fixture({ instructor: old.instructor, amount: 1000 }); await worker().processNext();
  const result = await balance(recent);
  assert.equal(result.eligibleSaleMinor, 800); assert.equal(result.eligibleAdjustmentMinor, -1600);
  assert.equal(result.netEligibleMinor, -800); assert.equal(result.blocked, false);
  assert.equal((await Payout.findOne()).status, 'paid'); assert.equal(await PayoutItem.countDocuments(), 1);
});
test('a historical positive cutoff cannot hide a newer already-known eligible debt', async () => {
  const current = await fixture(); await worker().processNext(); const old = await fixture({ instructor: current.instructor, amount: 2000 });
  await debt(old, { occurredAt: now });
  const result = await createEligibilityBalanceService({ clock }).inspect({ instructorId: current.instructor.id, cutoffAt: new Date(now.getTime() - 3600_000) });
  assert.equal(result.netEligibleMinor, -800); assert.equal(result.eligibleAdjustmentMinor, -1600);
});

async function payoutActor(role = 'admin') {
  const user = await User.create({ name: 'Payout operator', roles: [role], emailVerifiedAt: now,
    email: `${randomUUID()}@example.test`, passwordHash: 'unused-test-hash' });
  const familyId = randomUUID();
  await RefreshSession.create({ userId: user.id, familyId, tokenHash: randomUUID(), tokenVersion: 0,
    expiresAt: new Date(now.getTime() + 86400_000) });
  const auth = { userId: user.id, familyId, tokenVersion: 0, roles: [role] };
  return { auth, token: await signAccessToken(auth) };
}

function payoutInput(f) {
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric',
    month: '2-digit', day: '2-digit' }).format(now).slice(0, 7);
  return { instructorId: f.instructor.id, month, cutoffAt: now.toISOString() };
}

test('payout HTTP contracts reserve exact signed items and replay the original receipt', async () => {
  const old = await fixture(); const { adjustment } = await debt(old);
  const f = await fixture({ instructor: old.instructor, amount: 2000 });
  await worker().processNext();
  const { token } = await payoutActor();
  const student = await payoutActor('student');
  const api = request(createApp());
  const url = '/api/v1/admin/payouts';
  const input = payoutInput(f);
  const key = randomUUID();
  const post = body => api.post(url).auth(token, { type: 'bearer' }).set('Idempotency-Key', key).send(body);
  await api.get(url).expect(401);
  await api.get(url).auth(student.token, { type: 'bearer' }).expect(403);
  const preview = await api.get(`/api/v1/admin/instructors/${f.instructor.id}/settlement-preview`)
    .auth(token, { type: 'bearer' }).query({ month: input.month, cutoffAt: input.cutoffAt }).expect(200);
  assert.equal(preview.body.data.preview.netEligibleMinor, 800);
  assert.equal(await Payout.countDocuments({ status: 'draft' }), 0);
  await post({ ...input, amountMinor: 1600 }).expect(400);
  const created = await post(input).expect(201);
  const payout = created.body.data.payout;
  assert.equal(created.headers['cache-control'], 'no-store');
  assert.equal(payout.amountMinor, 800);
  assert.equal(payout.lineCount, 2);
  const replay = await post(input).expect(200);
  assert.deepEqual(replay.body, created.body);
  const clash = await post({ ...input, cutoffAt: new Date(now.getTime() - 1).toISOString() }).expect(409);
  assert.equal(clash.body.error.code, 'IDEMPOTENCY_CONFLICT');
  const detail = await api.get(`${url}/${payout.id}`).auth(token, { type: 'bearer' }).expect(200);
  assert.deepEqual(detail.body.data.items.map(item => item.amountMinor).sort((a, b) => a - b), [-800, 1600]);
  assert.equal(detail.body.data.payout.hasActiveHolds, false);
  assert.equal(detail.body.data.payout.idempotencyKey, undefined);
  const first = await api.get(url).auth(token, { type: 'bearer' }).query({ limit: 1 }).expect(200);
  assert.equal(first.body.data.payouts.length, 1);
  await api.get(url).auth(token, { type: 'bearer' }).query({ cursor: first.body.data.pagination.nextCursor, status: 'paid' }).expect(400);
  const second = await api.get(url).auth(token, { type: 'bearer' })
    .query({ cursor: first.body.data.pagination.nextCursor, limit: 1 }).expect(200);
  assert.notEqual(first.body.data.payouts[0].id, second.body.data.payouts[0].id);
  assert.equal(String((await EarningEntry.findById(adjustment.id)).payoutId), payout.id);
  assert.equal(await AdminAuditEvent.countDocuments({ action: 'payout.created' }), 1);
});

test('concurrent payout creation across admins claims each earning only once', async () => {
  const f = await fixture();
  await worker().processNext();
  const actors = [await payoutActor(), await payoutActor()];
  const result = await Promise.allSettled(actors.map(({ auth }) => createPayoutService({ clock })
    .create({ auth, input: payoutInput(f), idempotencyKey: randomUUID() })));
  assert.equal(result.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(result.find(row => row.status === 'rejected').reason.code, 'PAYOUT_ACTIVE');
  assert.equal(await Payout.countDocuments({ status: 'draft' }), 1);
  assert.equal(await PayoutItem.countDocuments(), 1);
});

test('confirmed refund cancels a reserved draft without losing its signed statement or original receipt', async () => {
  const f = await fixture();
  const other = await fixture({ instructor: f.instructor });
  await worker().processNext();
  await worker().processNext();
  const { auth } = await payoutActor();
  const service = createPayoutService({ clock });
  const command = { auth, input: payoutInput(f), idempotencyKey: randomUUID() };
  const created = await service.create(command);
  const observation = { kind: 'refund', providerRefundId: 're_draft_cancel', paymentIntentId: `pi_${f.order.id}`,
    amountMinor: 1000, currency: 'EGP', providerStatus: 'succeeded', providerCreatedAt: now,
    correlation: null, metadataConflict: false, payment: { id: `pi_${f.order.id}`, amountMinor: 1000,
      amountReceivedMinor: 1000, currency: 'EGP', orderId: f.order.id, status: 'succeeded', livemode: false } };
  await createRefundInboxService({ clock }).recordObservation(observation);
  const inbox = createPaymentWebhookWorker({ clock, provider: { async retrieveRefundObservation() { return observation; } } });
  workers.push(inbox);
  await inbox.processNext();
  const current = await service.get(created.payout.id);
  assert.equal(current.payout.status, 'cancelled');
  assert.equal(current.items.length, 2);
  assert.equal((await EarningEntry.findById(f.sale.id)).status, 'reversed');
  assert.equal((await EarningEntry.findById(other.sale.id)).status, 'eligible');
  assert.equal((await InstructorFinanceState.findOne({ instructorId: f.instructor.id })).activePayoutId, null);
  assert.deepEqual(await service.create(command), { payout: created.payout, replayed: true });
});

test('holds, capacity and non-positive net each prevent any reservation', async () => {
  const f = await fixture();
  const other = await fixture({ instructor: f.instructor });
  await worker().processNext();
  await worker().processNext();
  const { auth } = await payoutActor();
  const input = payoutInput(f);
  const create = options => createPayoutService({ clock, ...options }).create({ auth, input, idempotencyKey: randomUUID() });
  await assert.rejects(create({ capacity: 1 }), { code: 'EARNINGS_CAPACITY_EXCEEDED' });
  await debt(other);
  await assert.rejects(create(), { code: 'PAYOUT_NON_POSITIVE_BALANCE' });
  await hold(f);
  await assert.rejects(create(), { code: 'PAYOUT_BLOCKED' });
  assert.equal(await Payout.countDocuments({ status: 'draft' }), 0);
  assert.equal((await EarningEntry.findById(f.sale.id)).status, 'eligible');
});

test('a final audit failure rolls back the draft, finance pointer and earning claims', async () => {
  const f = await fixture();
  await worker().processNext();
  const { auth } = await payoutActor();
  const key = randomUUID();
  const targetId = new mongoose.Types.ObjectId();
  await AdminAuditEvent.create({ actorType: 'user', actorId: auth.userId, action: 'payout.created',
    targetType: 'payout', targetId, toStatus: 'draft', occurredAt: now, idempotencyKey: key,
    requestFingerprint: 'a'.repeat(64), result: { resourceId: targetId, status: 'draft', httpStatus: 201 } });
  await assert.rejects(createPayoutService({ clock }).create({ auth, input: payoutInput(f), idempotencyKey: key }), { code: 11000 });
  assert.equal(await Payout.countDocuments(), 0);
  assert.equal(await PayoutItem.countDocuments(), 0);
  assert.equal((await EarningEntry.findById(f.sale.id)).status, 'eligible');
  assert.equal((await InstructorFinanceState.findOne({ instructorId: f.instructor.id })).activePayoutId, null);
});

test('payout month follows Cairo calendar boundaries and handles year rollover', () => {
  const period = payoutPeriodSchema.parse({ month: '2026-12', cutoffAt: '2026-12-31T22:00:00Z' });
  assert.equal(period.periodStart.toISOString(), '2026-11-30T22:00:00.000Z');
  assert.equal(period.periodEnd.toISOString(), '2026-12-31T22:00:00.000Z');
  const summer = payoutPeriodSchema.parse({ month: '2026-07', cutoffAt: '2026-07-01T00:00:00Z' });
  assert.equal(summer.periodStart.toISOString(), '2026-06-30T21:00:00.000Z');
  assert.equal(payoutPeriodSchema.safeParse({ month: '2026-07', cutoffAt: '2026-06-30T20:59:59Z' }).success, false);
});
test('pending transfer-dependent debt remains pending and blocks release instead of being forgiven or promoted by time', async () => {
  const f = await fixture(); const { adjustment } = await debt(f, { pending: true, occurredAt: now });
  const recent = await fixture({ instructor: f.instructor }); await worker().processNext();
  const result = await balance(recent); assert.equal(result.deferredAdjustmentMinor, -800);
  assert.equal(result.blocked, true); assert.ok(result.reasonCodes.includes('DEPENDENT_TRANSFER_UNRESOLVED'));
  assert.equal((await EarningEntry.findById(adjustment.id)).status, 'pending'); assert.equal((await EarningEntry.findById(adjustment.id)).eligibleAt, null);
});
test('capacity errors fail on the complete signed set rather than returning a positive-only truncated total', async () => {
  const first = await fixture(); const second = await fixture({ instructor: first.instructor });
  const current = worker(); await current.processNext(); await current.processNext();
  await assert.rejects(createEligibilityBalanceService({ clock, capacity: 1 }).inspect({ instructorId: first.instructor.id }), { code: 'EARNINGS_CAPACITY_EXCEEDED' });
  assert.equal((await stored(second.sale.id)).status, 'eligible'); assert.equal(await Payout.countDocuments(), 0);
});
test('malformed legacy eligible balances are visible as blocked review and cannot be mistaken for payout authorization', async () => {
  const f = await fixture(); await EarningEntry.updateOne({ _id: f.sale.id }, { $set: { status: 'eligible' } });
  await Order.collection.updateOne({ _id: f.order._id }, { $set: { policyVersionId: null } });
  const result = await balance(f); assert.equal(result.blocked, true); assert.ok(result.reasonCodes.includes('EARNINGS_LEGACY_REQUIRES_REVIEW'));
  assert.equal((await stored(f.sale.id)).status, 'eligible'); assert.equal(await FinancialHold.countDocuments(), 0);
});
