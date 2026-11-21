import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';

import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { assertTransactionSupport } from '../src/config/transactions.js';
import { AdminAuditEvent } from '../src/models/AdminAuditEvent.js';
import { EarningEntry } from '../src/models/EarningEntry.js';
import { Enrollment } from '../src/models/Enrollment.js';
import { FinancialHold } from '../src/models/FinancialHold.js';
import { InstructorFinanceState } from '../src/models/InstructorFinanceState.js';
import { Order } from '../src/models/Order.js';
import { Payment } from '../src/models/Payment.js';
import { Payout } from '../src/models/Payout.js';
import { PayoutItem } from '../src/models/PayoutItem.js';
import { Refund } from '../src/models/Refund.js';
import { User } from '../src/models/User.js';
import { WebhookEvent } from '../src/models/WebhookEvent.js';
import { createRefundInboxService } from '../src/modules/refunds/refundInbox.service.js';
import { createRefundFulfillmentService } from '../src/modules/refunds/refundFulfillment.service.js';
import { createPaymentInboxService } from '../src/modules/payments/paymentInbox.service.js';
import { createPaymentWebhookWorker } from '../src/services/paymentWebhookWorker.service.js';
import { createRefundRecoveryWorker } from '../src/services/refundRecoveryWorker.service.js';

const models = [AdminAuditEvent, EarningEntry, Enrollment, FinancialHold, InstructorFinanceState,
  Refund, Payment, Order, PayoutItem, Payout, WebhookEvent, User];
let ready = false; let now; let observations; const workers = [];
const clock = () => new Date(now);
const provider = { async retrieveRefundObservation({ providerRefundId }) { return observations.get(providerRefundId); } };
before(async () => {
  await connectDatabase({ maxRetries: 1 }); assert.match(mongoose.connection.name, /_test$/);
  await assertTransactionSupport(); await Promise.all(models.map(Model => Model.init())); ready = true;
});
async function clear() {
  assert.ok(ready && mongoose.connection.readyState === 1); assert.match(mongoose.connection.name, /_test$/);
  await Promise.all(models.map(Model => Model.collection.deleteMany({})));
}
beforeEach(async () => { await Promise.all(workers.splice(0).map(worker => worker.stop())); await clear(); now = new Date(); observations = new Map(); });
after(async () => {
  try { await Promise.all(workers.splice(0).map(worker => worker.stop())); if (ready && mongoose.connection.readyState === 1) await clear(); }
  finally { await disconnectDatabase(); }
});
async function fixture() {
  const instructor = await User.create({ name: 'Refund instructor', email: `${randomUUID()}@example.test`,
    passwordHash: 'unused-test-hash', roles: ['instructor'], emailVerifiedAt: now });
  const order = await Order.create({ studentId: new mongoose.Types.ObjectId(), courseId: new mongoose.Types.ObjectId(),
    instructorId: instructor.id, courseTitleSnapshot: 'Refund course', amountMinor: 1000, currency: 'EGP',
    commissionBps: 2000, platformAmountMinor: 200, instructorAmountMinor: 800, status: 'paid', paidAt: now,
    expiresAt: new Date(now.getTime() - 1000) });
  const key = `checkout:${order.id}`;
  const payment = await Payment.create({ orderId: order.id, amountMinor: 1000, currency: 'EGP', status: 'succeeded',
    paidAt: now, paymentIntentId: `pi_${order.id}`, idempotencyKey: key, checkoutRequest: { orderId: order.id,
      courseTitle: 'Refund course', amountMinor: 1000, customerEmail: 'student@example.test', idempotencyKey: key,
      expiresAtSeconds: Math.floor(now.getTime() / 1000), successUrl: 'https://example.test/success', cancelUrl: 'https://example.test/cancel' } });
  const sale = await EarningEntry.create({ orderId: order.id, instructorId: instructor.id, type: 'sale', amountMinor: 800, currency: 'EGP' });
  const enrollment = await Enrollment.create({ studentId: order.studentId, courseId: order.courseId, sourceOrderId: order.id, enrolledAt: now });
  return { instructor, order, payment, sale, enrollment };
}
function observation(f, patch = {}) {
  return { kind: 'refund', providerRefundId: `re_${f.order.id}`, paymentIntentId: `pi_${f.order.id}`,
    amountMinor: 1000, currency: 'EGP', providerStatus: 'succeeded', providerCreatedAt: new Date(now.getTime() - 1000),
    correlation: null, metadataConflict: false, payment: { id: `pi_${f.order.id}`, amountMinor: 1000, amountReceivedMinor: 1000,
      currency: 'EGP', orderId: f.order.id, livemode: false, status: 'succeeded' }, ...patch };
}
function worker(options = {}) {
  const result = createPaymentWebhookWorker({ provider, clock, shutdownTimeoutMs: 30, ...options }); workers.push(result); return result;
}
async function enqueue(current) {
  observations.set(current.providerRefundId, current);
  return createRefundInboxService({ clock }).recordObservation(current);
}
async function finalize(current) { const id = await enqueue(current); await worker().processNext(); return WebhookEvent.findOne({ eventId: id }); }
async function assertSuccess(f) {
  assert.equal((await Order.findById(f.order.id)).status, 'refunded');
  assert.equal((await Order.findById(f.order.id)).purchaseSlotActive, false);
  assert.equal((await Payment.findById(f.payment.id)).status, 'refunded');
  assert.equal(await Refund.countDocuments({ paymentId: f.payment.id, status: 'succeeded' }), 1);
  assert.equal(await AdminAuditEvent.countDocuments({ action: 'refund.succeeded' }), 1);
}
test('external full refund atomically accounts legacy purchase, revokes only its enrollment and deduplicates concurrent workers', async () => {
  const f = await fixture(); const current = observation(f); const eventId = await enqueue(current);
  assert.equal(await FinancialHold.countDocuments({ resolvedAt: null }), 1);
  const left = worker(); const right = worker(); await Promise.all([left.processNext(), right.processNext()]);
  await assertSuccess(f); assert.equal((await EarningEntry.findById(f.sale.id)).status, 'reversed');
  const enrollment = await Enrollment.findById(f.enrollment.id);
  assert.equal(enrollment.status, 'revoked'); assert.equal(enrollment.revocationReason, 'refund');
  assert.equal(String(enrollment.revocationSourceOrderId), f.order.id);
  assert.equal(await FinancialHold.countDocuments({ resolvedAt: null }), 0);
  assert.equal((await WebhookEvent.findOne({ eventId })).status, 'processed');
  await enqueue(current); assert.equal(await left.processNext(), false);
  await assertSuccess(f);
});
test('pending, failed and canceled provider outcomes keep access and do not debit the ledger', async () => {
  for (const status of ['pending', 'failed', 'canceled']) {
    await clear(); const f = await fixture(); const event = await finalize(observation(f, { providerStatus: status }));
    assert.equal(event.status, 'processed'); assert.equal((await Order.findById(f.order.id)).status, 'paid');
    assert.equal((await Enrollment.findById(f.enrollment.id)).status, 'active');
    assert.equal((await EarningEntry.findById(f.sale.id)).status, 'pending');
    assert.equal(await FinancialHold.countDocuments({ resolvedAt: null }), status === 'pending' ? 1 : 0);
  }
});
test('a stale pending snapshot is finalized from fresh succeeded provider evidence; subsequent failure cannot regress it', async () => {
  const f = await fixture(); const pending = observation(f, { providerStatus: 'pending' });
  await enqueue(pending); observations.set(pending.providerRefundId, observation(f)); await worker().processNext(); await assertSuccess(f);
  await finalize(observation(f, { providerStatus: 'failed' })); await assertSuccess(f);
  assert.equal(await FinancialHold.countDocuments({ reasonCode: 'PROVIDER_REFUND_CONTRADICTION', resolvedAt: null }), 1);
});
test('external partial refunds and disputes remain held without full access/accounting effects', async () => {
  const f = await fixture(); await finalize(observation(f, { amountMinor: 300 }));
  assert.equal((await Refund.findOne()).status, 'requires_reconciliation');
  assert.equal((await Order.findById(f.order.id)).status, 'paid');
  assert.equal((await Enrollment.findById(f.enrollment.id)).status, 'active');
  const payload = { kind: 'dispute', disputeId: 'du_test', chargeId: 'ch_test', paymentIntentId: `pi_${f.order.id}` };
  await createRefundInboxService({ clock }).persist({ eventId: 'evt_dispute', eventType: 'charge.dispute.created', payload });
  const disputeProvider = { ...provider, async retrieveFinancialSafetyObservation() { return { kind: 'dispute',
    resourceId: 'du_test', paymentIntentId: payload.paymentIntentId, amountMinor: 1000, currency: 'EGP',
    providerStatus: 'needs_response', payment: observation(f).payment }; } };
  await worker({ provider: disputeProvider }).processNext();
  assert.equal(await FinancialHold.countDocuments({ resolvedAt: null, sourceType: 'dispute' }), 1);
  assert.equal((await EarningEntry.findById(f.sale.id)).status, 'pending');
});
test('metadata/amount inconsistencies retain a review hold and cannot grant or revoke access', async () => {
  const f = await fixture(); const event = await finalize(observation(f, { amountMinor: 1001 }));
  assert.equal(event.status, 'processed'); assert.equal(event.lastError, 'REFUND_REQUIRES_REVIEW');
  assert.equal(await Refund.countDocuments(), 0); assert.equal((await Order.findById(f.order.id)).status, 'paid');
  assert.equal(await FinancialHold.countDocuments({ resolvedAt: null }), 1);
});
test('parent payment mismatch fails the inbox with its ingress hold and no side effects', async () => {
  const f = await fixture(); const current = observation(f); current.payment.orderId = new mongoose.Types.ObjectId().toString();
  const event = await finalize(current); assert.equal(event.status, 'failed'); assert.equal(event.lastError, 'REFUND_EVIDENCE_MISMATCH');
  assert.equal(await Refund.countDocuments(), 0); assert.equal(await FinancialHold.countDocuments({ resolvedAt: null }), 1);
});
test('full-refund revocation preserves an administrator/legal block and a newer purchase source', async () => {
  for (const mode of ['legal', 'new-purchase']) {
    await clear(); const f = await fixture();
    await Enrollment.updateOne({ _id: f.enrollment.id }, { $set: mode === 'legal'
      ? { status: 'revoked', revocationReason: 'legal', revokedAt: now }
      : { sourceOrderId: new mongoose.Types.ObjectId() } });
    await finalize(observation(f)); await assertSuccess(f);
    const enrollment = await Enrollment.findById(f.enrollment.id);
    assert.equal(enrollment.status, mode === 'legal' ? 'revoked' : 'active');
    assert.equal(enrollment.revocationReason, mode === 'legal' ? 'legal' : null);
  }
});
async function reservePayout(f, status, { extra = false } = {}) {
  const entries = [f.sale];
  if (extra) entries.push(await EarningEntry.create({ instructorId: f.instructor.id, orderId: new mongoose.Types.ObjectId(),
    type: 'sale', amountMinor: 200, currency: 'EGP', status: 'eligible' }));
  const payout = await Payout.create({ instructorId: f.instructor.id, amountMinor: extra ? 1000 : 800, currency: 'EGP',
    lineCount: entries.length, periodStart: new Date(now.getTime() - 86400_000), periodEnd: now, cutoffAt: now,
    createdBy: f.instructor.id, idempotencyKey: randomUUID(), requestFingerprint: 'a'.repeat(64), status,
    ...(status === 'draft' ? {} : { sealedAt: now, sealedBy: f.instructor.id, transferAttemptId: randomUUID(),
      transferMethod: 'test_simulation', transferOutcome: status === 'paid' ? 'confirmed_paid' : 'unknown' }),
    ...(status === 'paid' ? { paidAt: now, paidBy: f.instructor.id, transferReference: 'TEST-TRANSFER' } : {}) });
  for (const entry of entries) {
    await PayoutItem.create({ payoutId: payout.id, earningEntryId: entry.id, instructorId: f.instructor.id,
      type: entry.type, amountMinor: entry.amountMinor, currency: 'EGP' });
    await EarningEntry.updateOne({ _id: entry.id }, { $set: { status: 'included_in_payout', payoutId: payout.id } });
  }
  return { payout, entries };
}
test('confirmed refund cancels a draft atomically, releases every other claim and preserves immutable payout items', async () => {
  const f = await fixture(); const { payout, entries } = await reservePayout(f, 'draft', { extra: true });
  await finalize(observation(f)); await assertSuccess(f);
  const cancelled = await Payout.findById(payout.id);
  assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.cancellationSource, 'refund');
  assert.equal((await EarningEntry.findById(entries[1].id)).status, 'eligible');
  assert.equal((await EarningEntry.findById(entries[1].id)).payoutId, null);
  assert.equal((await EarningEntry.findById(f.sale.id)).status, 'reversed');
  assert.equal(await PayoutItem.countDocuments(), 2);
});
test('pending transfer retains its sealed payout and produces one deferred debt plus a blocking hold', async () => {
  const f = await fixture(); const { payout } = await reservePayout(f, 'pending'); await finalize(observation(f)); await assertSuccess(f);
  const adjustment = await EarningEntry.findOne({ type: 'refund_adjustment' });
  assert.equal(adjustment.amountMinor, -800); assert.equal(adjustment.status, 'pending');
  assert.equal(String(adjustment.dependentOnPayoutId), payout.id);
  assert.equal((await Payout.findById(payout.id)).status, 'pending');
  assert.equal(await FinancialHold.countDocuments({ resolvedAt: null, reasonCode: 'REFUND_DEPENDENT_TRANSFER' }), 1);
});
test('paid transfer remains immutable and carries an eligible negative adjustment to a future payout', async () => {
  const f = await fixture(); const { payout } = await reservePayout(f, 'paid'); await finalize(observation(f)); await assertSuccess(f);
  const adjustment = await EarningEntry.findOne({ type: 'refund_adjustment' });
  assert.equal(adjustment.amountMinor, -800); assert.equal(adjustment.status, 'eligible'); assert.equal(adjustment.dependentOnPayoutId, null);
  assert.equal((await Payout.findById(payout.id)).amountMinor, 800); assert.equal(await FinancialHold.countDocuments({ resolvedAt: null }), 0);
});
test('missing ledger proof rolls back refund/order/enrollment/audit together and retains ingress hold', async () => {
  const f = await fixture(); await EarningEntry.collection.deleteOne({ _id: f.sale._id });
  const event = await finalize(observation(f)); assert.equal(event.status, 'failed');
  assert.equal(event.lastError, 'REFUND_LEDGER_REQUIRES_REVIEW'); assert.equal(await Refund.countDocuments(), 0);
  assert.equal((await Order.findById(f.order.id)).status, 'paid');
  assert.equal((await Enrollment.findById(f.enrollment.id)).status, 'active');
  assert.equal(await AdminAuditEvent.countDocuments({ action: 'refund.succeeded' }), 0);
  assert.equal(await FinancialHold.countDocuments({ resolvedAt: null }), 1);
});
test('shutdown detaches a late SDK read and leaves its lease for recovery without finalizing', async () => {
  const f = await fixture(); const current = observation(f); await enqueue(current);
  let release; let entered; const started = new Promise(resolve => { entered = resolve; });
  const delayed = worker({ provider: { async retrieveRefundObservation() { entered(); return new Promise(resolve => { release = resolve; }); } } });
  const work = delayed.processNext(); await started; await delayed.stop(); await work; release(current);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(await Refund.countDocuments(), 0);
  assert.equal((await WebhookEvent.findOne()).status, 'processing'); assert.equal((await Order.findById(f.order.id)).status, 'paid');
});
test('expired processing lease at commit rolls back all financial effects', async () => {
  const f = await fixture(); const current = observation(f); const id = await enqueue(current);
  const job = await WebhookEvent.findOneAndUpdate({ eventId: id }, { $set: { status: 'processing', leaseId: 'owned', leaseUntil: new Date(now.getTime() + 1000) } },
    { returnDocument: 'after' }).select('+payload +leaseId');
  let reads = 0;
  const fulfillment = createRefundFulfillmentService({ clock: () => { reads++; return new Date(now.getTime() + (reads >= 3 ? 2000 : 0)); } });
  await assert.rejects(fulfillment.fulfill({ job, current }), { code: 'PAYMENT_EVENT_LEASE_LOST' });
  assert.equal(await Refund.countDocuments(), 0); assert.equal((await Order.findById(f.order.id)).status, 'paid');
});
test('authenticated recovery appends financial evidence for previously ignored events without rewriting their receipt', async () => {
  const f = await fixture(); const current = observation(f);
  await WebhookEvent.create({ eventId: 'evt_old_refund', eventType: 'refund.updated', payload: { created: Math.floor(now.getTime() / 1000) },
    status: 'ignored', processedAt: now, lastReceivedAt: now, availableAt: now });
  const inbox = createPaymentInboxService({ provider: { async retrieveEvent() { return { id: 'evt_old_refund', type: 'refund.updated', livemode: false,
    created: Math.floor(now.getTime() / 1000), data: { object: { id: current.providerRefundId, object: 'refund', amount: 1000,
      currency: 'egp', payment_intent: current.paymentIntentId, created: Math.floor(current.providerCreatedAt.getTime() / 1000), status: 'succeeded' } } }; } }, clock });
  await inbox.recover('evt_old_refund'); await inbox.recover('evt_old_refund');
  assert.equal((await WebhookEvent.findOne({ eventId: 'evt_old_refund' })).status, 'ignored');
  assert.equal(await WebhookEvent.countDocuments({ status: 'pending', origin: 'reconciliation' }), 1);
});
test('recovery reads a provider-bound external refund with issuance disabled and queues the same inbox', async () => {
  const f = await fixture(); const current = observation(f, { providerStatus: 'pending' }); await finalize(current);
  observations.set(current.providerRefundId, observation(f)); now = new Date(now.getTime() + 61_000);
  const recovery = createRefundRecoveryWorker({ provider, clock, issuanceEnabled: false }); workers.push(recovery);
  assert.equal(await recovery.processNext(), true); assert.equal((await Refund.findOne()).status, 'pending');
  await worker().processNext(); await assertSuccess(f);
});

test('charge-level notifications queue complete refund observations in the shared inbox and release holds only after accounting', async () => {
  const f = await fixture(); const current = observation(f);
  const payload = { kind: 'charge', chargeId: 'ch_test', paymentIntentId: current.paymentIntentId };
  await createRefundInboxService({ clock }).persist({ eventId: 'evt_charge', eventType: 'charge.refunded', payload });
  const charged = worker({ provider: { ...provider, async retrieveFinancialSafetyObservation() { return { kind: 'charge',
    resourceId: 'ch_test', paymentIntentId: current.paymentIntentId, amountMinor: 1000, currency: 'EGP',
    refundedAmountMinor: 1000, refunds: [current], payment: current.payment }; } } });
  await charged.processNext(); assert.equal((await Order.findById(f.order.id)).status, 'paid');
  assert.equal(await WebhookEvent.countDocuments({ origin: 'reconciliation', status: 'pending' }), 1);
  observations.set(current.providerRefundId, current); await charged.processNext(); await assertSuccess(f);
  assert.equal(await FinancialHold.countDocuments({ resolvedAt: null }), 0);
});
test('contradictory charge aggregate proof keeps a separate hold after an otherwise valid full-refund observation', async () => {
  const f = await fixture(); const current = observation(f);
  await createRefundInboxService({ clock }).persist({ eventId: 'evt_bad_charge', eventType: 'charge.refunded',
    payload: { kind: 'charge', chargeId: 'ch_test', paymentIntentId: current.paymentIntentId } });
  const charged = worker({ provider: { ...provider, async retrieveFinancialSafetyObservation() { return { kind: 'charge',
    resourceId: 'ch_test', paymentIntentId: current.paymentIntentId, amountMinor: 1000, currency: 'EGP',
    refundedAmountMinor: 300, refunds: [current], payment: current.payment }; } } });
  await charged.processNext(); observations.set(current.providerRefundId, current); await charged.processNext(); await assertSuccess(f);
  assert.equal(await FinancialHold.countDocuments({ resolvedAt: null, reasonCode: 'CHARGE_REFUND_TOTAL_REQUIRES_REVIEW' }), 1);
});
test('provider evidence remains durable for orphan accounts and unassociated early events', async () => {
  const f = await fixture(); await User.deleteOne({ _id: f.instructor.id });
  await enqueue(observation(f)); assert.equal(await WebhookEvent.countDocuments({ status: 'pending' }), 1);
  assert.equal(await InstructorFinanceState.countDocuments(), 0);
  const other = observation(f, { providerRefundId: 're_unknown', paymentIntentId: 'pi_unknown' });
  await enqueue(other); assert.equal(await WebhookEvent.countDocuments({ status: 'pending' }), 2);
});

test('recovery shutdown ignores a late provider observation without queuing work or releasing its lease', async () => {
  const f = await fixture(); const current = observation(f, { providerStatus: 'pending' }); await finalize(current);
  now = new Date(now.getTime() + 61_000);
  let release; let entered; const started = new Promise(resolve => { entered = resolve; });
  const recovery = createRefundRecoveryWorker({ clock, issuanceEnabled: false, shutdownTimeoutMs: 30,
    provider: { async retrieveRefundObservation() { entered(); return new Promise(resolve => { release = resolve; }); } } }); workers.push(recovery);
  const operation = recovery.processNext(); await started; await recovery.stop(); await operation; release(observation(f));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await WebhookEvent.countDocuments(), 1); assert.equal((await Refund.findOne()).status, 'pending');
  assert.ok((await Refund.findOne().select('+recoveryLeaseUntil')).recoveryLeaseUntil);
});
