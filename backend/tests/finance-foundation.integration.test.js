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
import { FinancialPolicyVersion } from '../src/models/FinancialPolicyVersion.js';
import { InstructorFinanceState } from '../src/models/InstructorFinanceState.js';
import { Order } from '../src/models/Order.js';
import { Payment } from '../src/models/Payment.js';
import { Payout } from '../src/models/Payout.js';
import { PayoutItem } from '../src/models/PayoutItem.js';
import { Refund } from '../src/models/Refund.js';
import { User } from '../src/models/User.js';
import { appendAuditEvent } from '../src/modules/audit/audit.service.js';
import { refundRequestIdentity } from '../src/modules/finance/financeIdentity.js';
import { createFinanceFoundationService } from '../src/modules/finance/finance.service.js';
import { inspectFinancialFoundation } from '../src/modules/finance/financeReadiness.service.js';

const id = () => new mongoose.Types.ObjectId();
const newModels = [FinancialPolicyVersion, Refund, Payout, PayoutItem, InstructorFinanceState,
  FinancialHold, AdminAuditEvent];
const models = [...newModels, Payment, Order, EarningEntry, Enrollment, User];
const now = new Date('2026-11-18T12:00:00Z');
let ready = false;

before(async () => {
  await connectDatabase({ maxRetries: 1 });
  assert.match(mongoose.connection.name, /_test$/);
  await assertTransactionSupport();
  await Promise.all(models.map(Model => Model.init()));
  ready = true;
});
async function clearFixtures() {
  assert.equal(ready && mongoose.connection.readyState === 1, true);
  assert.match(mongoose.connection.name, /_test$/);
  // Financial models intentionally forbid ordinary deletion. Native access is restricted
  // here to explicit, isolated test fixtures, not exported as an application operation.
  await Promise.all(models.map(Model => Model.collection.deleteMany({})));
}
beforeEach(clearFixtures);
after(async () => {
  try { if (ready && mongoose.connection.readyState === 1) await clearFixtures(); }
  finally { await disconnectDatabase(); }
});

function policyInput(overrides = {}) {
  return { version: 'test-policy-v1', effectiveFrom: now, refundWindowSeconds: 14 * 86400,
    refundMode: 'full', lateAdminOverrideAllowed: true,
    eligibilityRule: 'after_refund_window_without_holds', approvalSource: 'product_delegation',
    approvedAt: new Date(now.getTime() - 1000), approvalReference: 'test-record-2026-11-18', ...overrides };
}
async function instructorIdentity() {
  const user = await User.create({ name: 'Finance Instructor', email: `${randomUUID()}@finance.example.test`,
    passwordHash: 'unused-test-login-hash', roles: ['instructor'] });
  return user.id;
}
function refundInput(overrides = {}) {
  const orderId = id();
  const reason = 'A documented test refund explanation';
  return { orderId, paymentId: id(), instructorId: id(), source: 'admin', kind: 'full',
    amountMinor: 1000, paymentAmountMinor: 1000, currency: 'EGP', initiatedBy: id(), reason,
    ...refundRequestIdentity({ orderId: orderId.toString(), reason, idempotencyKey: randomUUID() }),
    ...overrides };
}
function payoutInput(overrides = {}) {
  return { instructorId: id(), amountMinor: 800, currency: 'EGP', lineCount: 2,
    periodStart: new Date('2026-10-01T00:00:00Z'), periodEnd: new Date('2026-11-01T00:00:00Z'),
    cutoffAt: new Date('2026-11-01T00:00:00Z'), createdBy: id(), idempotencyKey: randomUUID(),
    requestFingerprint: 'a'.repeat(64), ...overrides };
}
const sealed = () => ({ sealedAt: now, sealedBy: id(), transferAttemptId: randomUUID(),
  transferMethod: 'test_simulation', transferOutcome: 'unknown' });
const paid = () => ({ ...sealed(), status: 'paid', transferOutcome: 'confirmed_paid',
  transferReference: 'TEST-TRANSFER-001', paidAt: now, paidBy: id() });
function orderInput(overrides = {}) {
  return { studentId: id(), courseId: id(), instructorId: id(), courseTitleSnapshot: 'Test course',
    amountMinor: 1000, currency: 'EGP', commissionBps: 2000, platformAmountMinor: 200,
    instructorAmountMinor: 800, expiresAt: new Date(now.getTime() + 3600_000), ...overrides };
}

test('financial models enforce bounds, signs, complete states and strict metadata', async () => {
  for (const Model of newModels) {
    assert.equal(Model.schema.indexes().some(([, options]) => options.expireAfterSeconds != null), false);
  }
  for (const input of [refundInput({ amountMinor: -1 }), refundInput({ amountMinor: 999 }),
    refundInput({ amountMinor: 1.5 }), refundInput({ amountMinor: Number.MAX_SAFE_INTEGER + 1 }),
    refundInput({ currency: 'USD' }), refundInput({ initiatedBy: null }),
    refundInput({ status: 'succeeded' }), refundInput({ source: 'provider', providerRefundId: 're_external' })]) {
    await assert.rejects(new Refund(input).validate(), { name: 'ValidationError' });
  }
  for (const input of [payoutInput({ amountMinor: 0 }), payoutInput({ lineCount: 0 }),
    payoutInput({ cutoffAt: new Date('2027-01-01') }), payoutInput({ status: 'pending' }),
    payoutInput({ ...sealed(), status: 'paid' }), payoutInput({ status: 'cancelled' }),
    payoutInput({ ...sealed(), status: 'draft' }), payoutInput({ paidAt: now }),
    payoutInput({ cancellationReason: 'Unjustified draft cancellation data' })]) {
    await assert.rejects(new Payout(input).validate(), { name: 'ValidationError' });
  }
  for (const [type, amountMinor] of [['sale', -1], ['refund_adjustment', 1], ['sale', 1.5]]) {
    await assert.rejects(new PayoutItem({ payoutId: id(), earningEntryId: id(), instructorId: id(),
      currency: 'EGP', type, amountMinor }).validate(), { name: 'ValidationError' });
  }
  assert.throws(() => new Refund(refundInput({ rawProviderResponse: { secret: 'private' } })),
    { name: 'StrictModeError' });
});

test('policy versions have unambiguous activation, immutable history and no implicit seeding', async () => {
  assert.equal(await FinancialPolicyVersion.countDocuments(), 0);
  const policy = await FinancialPolicyVersion.create(policyInput());
  await assert.rejects(FinancialPolicyVersion.create(policyInput({ effectiveFrom: new Date(now.getTime() + 1) })),
    { code: 11000 });
  await assert.rejects(FinancialPolicyVersion.create(policyInput({ version: 'test-policy-v2' })), { code: 11000 });
  await assert.rejects(new FinancialPolicyVersion(policyInput({ refundWindowSeconds: 0 })).validate(),
    { name: 'ValidationError' });
  await assert.rejects(new FinancialPolicyVersion(policyInput({ approvalSource: 'admin_approval' })).validate(),
    { name: 'ValidationError' });
  await assert.rejects(FinancialPolicyVersion.updateOne({ _id: policy.id },
    { $set: { refundWindowSeconds: 1 } }), /Financial history/);
  policy.refundWindowSeconds = 1;
  await assert.rejects(policy.save(), /Financial history/);
});

test('concurrent full-refund reservations allow one winner and confirmed success remains exclusive', async () => {
  const paymentId = id();
  const results = await Promise.allSettled([Refund.create(refundInput({ paymentId })),
    Refund.create(refundInput({ paymentId }))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 11000);
  await Refund.create(refundInput({ status: 'succeeded', providerRefundId: 're_success', completedAt: now }));
  const completed = await Refund.findOne({ providerRefundId: 're_success' });
  await assert.rejects(Refund.create(refundInput({ paymentId: completed.paymentId })), { code: 11000 });
});

test('refund identities avoid null collisions, allow external partial rows and isolate local actors', async () => {
  const paymentId = id();
  const external = suffix => ({ orderId: id(), paymentId, instructorId: id(), source: 'provider',
    kind: 'partial', amountMinor: 100, paymentAmountMinor: 1000, currency: 'EGP',
    providerRefundId: `re_${suffix}`, status: 'pending' });
  await Refund.create(external('one'));
  await Refund.create(external('two'));
  await assert.rejects(Refund.create(external('one')), { code: 11000 });
  const local = refundInput();
  await Refund.create(local);
  await assert.rejects(Refund.create(refundInput({ initiatedBy: local.initiatedBy,
    idempotencyKey: local.idempotencyKey })), { code: 11000 });
  await Refund.create(refundInput({ idempotencyKey: local.idempotencyKey }));
  await assert.rejects(Refund.create(refundInput({ providerIdempotencyKey: local.providerIdempotencyKey })),
    { code: 11000 });
  const failed = await Refund.create(refundInput({ status: 'failed' }));
  await Refund.create(refundInput({ paymentId: failed.paymentId }));
});

test('payout active claims are unique across months and normalized paid references remain unique', async () => {
  const instructorId = id();
  const results = await Promise.allSettled([Payout.create(payoutInput({ instructorId })),
    Payout.create(payoutInput({ instructorId, status: 'pending', ...sealed(),
      periodStart: new Date('2026-09-01'), periodEnd: new Date('2026-10-01'), cutoffAt: new Date('2026-10-01') }))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 11000);
  await Payout.create(payoutInput({ ...paid(), transferReference: ' transfer-123 ' }));
  await assert.rejects(Payout.create(payoutInput({ ...paid(), transferReference: 'TRANSFER-123' })), { code: 11000 });
  await Payout.create(payoutInput({ ...paid(), transferReference: 'different-transfer' }));
  const input = payoutInput();
  await Payout.create(input);
  await assert.rejects(Payout.create(payoutInput({ createdBy: input.createdBy,
    idempotencyKey: input.idempotencyKey })), { code: 11000 });
});

test('payout item snapshots are immutable and cancellation history does not forbid later reclaims', async () => {
  const item = { payoutId: id(), earningEntryId: id(), instructorId: id(),
    type: 'sale', amountMinor: 800, currency: 'EGP' };
  const saved = await PayoutItem.create(item);
  await assert.rejects(PayoutItem.create(item), { code: 11000 });
  await PayoutItem.create({ ...item, payoutId: id() });
  await assert.rejects(PayoutItem.updateOne({ _id: saved.id }, { $set: { amountMinor: 1 } }), /Financial history/);
  await assert.rejects(PayoutItem.bulkWrite([{ updateOne: { filter: { _id: saved.id },
    update: { $set: { amountMinor: 1 } } } }]), /Financial history/);
  await assert.rejects(saved.deleteOne(), /Financial history/);
});

test('financial history rejects pipelines, replacements, deletes, bulk mutation and validation bypass', async () => {
  const refund = await Refund.create(refundInput());
  for (const mutation of [
    () => Refund.updateOne({ _id: refund.id }, { $set: { amountMinor: 1 } }),
    () => Refund.updateMany({}, [{ $set: { amountMinor: 1 } }], { updatePipeline: true }),
    () => Refund.replaceOne({ _id: refund.id }, refundInput()),
    () => Refund.findOneAndReplace({ _id: refund.id }, refundInput()),
    () => Refund.updateOne({ _id: refund.id }, { $rename: { currency: 'other' } }),
    () => Refund.bulkWrite([{ deleteOne: { filter: { _id: refund.id } } }]),
    () => Refund.bulkWrite([{ insertOne: { document: refundInput() } }], { skipValidation: true }),
    () => Refund.findOneAndDelete({ _id: refund.id }),
    () => Refund.deleteMany({}),
  ]) await assert.rejects(async () => mutation(), /Financial (history|snapshots)/);
  await assert.rejects(Refund.updateOne({ _id: refund.id }, { $set: { status: 'invented' } }),
    { name: 'ValidationError' });
  assert.equal(await Refund.countDocuments(), 1);
});

test('write-once provider fields require null CAS and cannot be overwritten after binding', async () => {
  const refund = await Refund.create(refundInput());
  await assert.rejects(Refund.updateOne({ _id: refund.id }, { $set: { providerRefundId: 're_bound' } }),
    /Financial history/);
  assert.equal((await Refund.updateOne({ _id: refund.id, providerRefundId: null },
    { $set: { providerRefundId: 're_bound' } })).modifiedCount, 1);
  assert.equal((await Refund.updateOne({ _id: refund.id, providerRefundId: null },
    { $set: { providerRefundId: 're_other' } })).matchedCount, 0);
  await assert.rejects(Refund.updateOne({ _id: refund.id, providerRefundId: 're_bound' },
    { $set: { providerRefundId: 're_other' } }), /Financial history/);
  const loaded = await Refund.findById(refund.id).select('+providerRefundId');
  assert.equal(loaded.providerRefundId, 're_bound');
  loaded.providerRefundId = 're_other';
  await assert.rejects(loaded.save(), /Financial history/);
});

test('legacy financial metadata remains null and new confirmation uses immutable CAS without changing paidAt', async () => {
  const order = await Order.create(orderInput({ paidAt: now }));
  assert.equal(order.policyVersionId, null);
  assert.equal(order.paymentConfirmedAt, null);
  const confirmation = new Date(now.getTime() - 600_000);
  const deadline = new Date(confirmation.getTime() + 14 * 86400_000);
  await Order.updateOne({ _id: order.id, paymentConfirmedAt: null, refundDeadlineAt: null },
    { $set: { paymentConfirmedAt: confirmation, refundDeadlineAt: deadline } });
  const stored = await Order.findById(order.id);
  assert.equal(stored.paidAt.getTime(), now.getTime());
  assert.equal(stored.paymentConfirmedAt.getTime(), confirmation.getTime());
  await assert.rejects(Order.updateOne({ _id: order.id }, { $set: { refundDeadlineAt: now } }), /Financial history/);
  await assert.rejects(Order.updateOne({ _id: order.id }, { $set: { policyVersionId: id() } }), /Financial snapshots/);
  await assert.rejects(new Order(orderInput({ policyVersionId: id() })).validate(), { name: 'ValidationError' });
  const earning = await EarningEntry.create({ instructorId: id(), orderId: order.id,
    type: 'sale', amountMinor: 800, currency: 'EGP' });
  await EarningEntry.updateOne({ _id: earning.id, eligibleAt: null }, { $set: { eligibleAt: deadline } });
  await assert.rejects(EarningEntry.updateOne({ _id: earning.id }, { $set: { eligibleAt: now } }), /Financial history/);
});

test('concurrent guard initialization and holds are serialized across independent service instances', async () => {
  const instructorId = await instructorIdentity();
  const one = createFinanceFoundationService({ clock: () => new Date(now) });
  const two = createFinanceFoundationService({ clock: () => new Date(now) });
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) => {
    const service = index % 2 ? one : two;
    return service.runForInstructor({ instructorId }, context => service.openHold(context,
      { sourceType: 'refund', sourceId: 'same-refund', reasonCode: 'REFUND_PENDING' }));
  }));
  assert.equal(new Set(results.map(hold => hold.id)).size, 1);
  assert.equal(await InstructorFinanceState.countDocuments({ instructorId }), 1);
  assert.equal((await InstructorFinanceState.findOne({ instructorId })).revision, 8);
  assert.equal(await FinancialHold.countDocuments(), 1);
  assert.equal(await AdminAuditEvent.countDocuments({ action: 'financial_hold.opened' }), 1);
});

test('holds and audit roll back with the guarded mutation, including audit persistence failure', async t => {
  const instructorId = await instructorIdentity();
  const service = createFinanceFoundationService({ clock: () => new Date(now) });
  const open = context => service.openHold(context,
    { sourceType: 'legacy', sourceId: 'test-mapping', reasonCode: 'LEGACY_TIME_UNKNOWN' });
  await assert.rejects(service.runForInstructor({ instructorId }, async context => {
    await open(context);
    throw new Error('Simulated domain failure');
  }), /Simulated domain failure/);
  assert.equal(await FinancialHold.countDocuments(), 0);
  assert.equal(await AdminAuditEvent.countDocuments(), 0);
  assert.equal((await InstructorFinanceState.findOne({ instructorId })).revision, 0);
  const failure = t.mock.method(AdminAuditEvent, 'insertMany', async () => { throw new Error('Audit failure'); });
  try { await assert.rejects(service.runForInstructor({ instructorId }, open), /Audit failure/); }
  finally { failure.mock.restore(); }
  assert.equal(await FinancialHold.countDocuments(), 0);
  assert.equal((await InstructorFinanceState.findOne({ instructorId })).revision, 0);
});

test('hold resolution is isolated, audited, idempotent and cannot resolve other instructors or stale contexts', async () => {
  const instructorId = await instructorIdentity();
  const service = createFinanceFoundationService({ clock: () => new Date(now) });
  let staleContext;
  const hold = await service.runForInstructor({ instructorId }, async context => {
    staleContext = context;
    return service.openHold(context,
      { sourceType: 'refund', sourceId: 'test-refund', reasonCode: 'REFUND_PENDING' });
  });
  await assert.rejects(service.assertNoHolds(staleContext), TypeError);
  await assert.rejects(service.runForInstructor({ instructorId }, context => service.assertNoHolds(context)),
    { code: 'FINANCIAL_HOLD_ACTIVE' });
  await assert.rejects(service.runForInstructor({ instructorId: await instructorIdentity() },
    context => service.resolveHold(context, { holdId: hold.id, resolutionCode: 'REFUND_FAILED' })),
  { code: 'FINANCIAL_STATE_CONFLICT' });
  const resolve = context => service.resolveHold(context, { holdId: hold.id, resolutionCode: 'REFUND_FAILED' });
  await service.runForInstructor({ instructorId }, resolve);
  await service.runForInstructor({ instructorId }, resolve);
  assert.equal(await AdminAuditEvent.countDocuments({ action: 'financial_hold.resolved' }), 1);
  const audit = await AdminAuditEvent.findOne({ action: 'financial_hold.resolved' });
  assert.equal(audit.fromStatus, 'open');
  assert.equal(audit.toStatus, 'resolved');
  await service.runForInstructor({ instructorId }, context => service.assertNoHolds(context));
  await assert.rejects(service.runForInstructor({ instructorId }, context => service.resolveHold(context,
    { holdId: hold.id, resolutionCode: 'DIFFERENT_RESOLUTION' })), { code: 'FINANCIAL_STATE_CONFLICT' });
});

test('guarded competing payout claims roll back loser items and audit instead of leaving orphan reservations', async () => {
  const instructorId = await instructorIdentity();
  const createClaim = async () => {
    const service = createFinanceFoundationService({ clock: () => new Date(now) });
    return service.runForInstructor({ instructorId }, async context => {
      await service.assertNoHolds(context);
      const [payout] = await Payout.create([payoutInput({ instructorId })], { session: context.session });
      await PayoutItem.create([{ payoutId: payout.id, earningEntryId: id(), instructorId,
        type: 'sale', amountMinor: 800, currency: 'EGP' }], { session: context.session });
      await appendAuditEvent({ session: context.session, occurredAt: context.now, input: {
        actorType: 'system', action: 'payout.created', targetType: 'payout', targetId: payout.id,
      } });
      return payout;
    });
  };
  const results = await Promise.allSettled([createClaim(), createClaim()]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 11000);
  assert.equal(await Payout.countDocuments(), 1);
  assert.equal(await PayoutItem.countDocuments(), 1);
  assert.equal(await AdminAuditEvent.countDocuments({ action: 'payout.created' }), 1);
});

test('audit receipts have action-scoped uniqueness, keyless events coexist and cannot be mutated', async () => {
  const actorId = id();
  const base = { actorType: 'user', actorId, action: 'payout.created', targetType: 'payout',
    targetId: id(), occurredAt: now };
  await AdminAuditEvent.create(base);
  await AdminAuditEvent.create(base);
  const receipt = { ...base, idempotencyKey: 'command-receipt-001', requestFingerprint: 'b'.repeat(64),
    result: { resourceId: base.targetId, status: 'draft', httpStatus: 201 } };
  const saved = await AdminAuditEvent.create(receipt);
  await assert.rejects(AdminAuditEvent.create(receipt), { code: 11000 });
  await AdminAuditEvent.create({ ...receipt, action: 'payout.submitted' });
  await assert.rejects(AdminAuditEvent.updateOne({ _id: saved.id }, { $set: { action: 'payout.paid' } }), /Financial history/);
  await assert.rejects(AdminAuditEvent.deleteMany({}), /Financial history/);
  assert.equal((await AdminAuditEvent.findById(saved.id)).result, undefined);
});

test('normal reads do not reveal internal refund keys and unknown transitions cannot silently activate policies', async () => {
  const saved = await Refund.create(refundInput());
  const result = (await Refund.findById(saved.id)).toObject();
  for (const key of ['idempotencyKey', 'providerIdempotencyKey', 'requestFingerprint', 'providerRefundId',
    'leaseId', 'leaseUntil']) assert.equal(key in result, false, key);
  assert.equal(await FinancialPolicyVersion.countDocuments(), 0);
  for (const Model of newModels) assert.equal(Model.schema.indexes().some(([, options]) => options.expireAfterSeconds), false);
});

test('orphan accounts, invalid clocks, foreign contexts and revision overflow fail without domain writes', async () => {
  const service = createFinanceFoundationService({ clock: () => new Date(now) });
  await assert.rejects(service.runForInstructor({ instructorId: id().toString() }, () => {}),
    { code: 'FINANCIAL_ACCOUNT_NOT_FOUND' });
  assert.equal(await InstructorFinanceState.countDocuments(), 0);
  const instructorId = await instructorIdentity();
  const broken = createFinanceFoundationService({ clock: () => new Date(NaN) });
  await assert.rejects(broken.runForInstructor({ instructorId }, () => {}), TypeError);
  await service.runForInstructor({ instructorId }, async context => {
    await assert.rejects(broken.openHold(context,
      { sourceType: 'operations', sourceId: 'test', reasonCode: 'TEST_HOLD' }), TypeError);
  });
  await InstructorFinanceState.updateOne({ instructorId }, { $set: { revision: Number.MAX_SAFE_INTEGER } });
  await assert.rejects(service.runForInstructor({ instructorId }, () => {}), { code: 'FINANCIAL_STATE_CONFLICT' });
  assert.equal(await FinancialHold.countDocuments(), 0);
  assert.equal(await AdminAuditEvent.countDocuments(), 0);
});

test('suspended existing accounts retain accounting but holds cannot be silently reused or reassigned', async () => {
  const instructorId = await instructorIdentity();
  await User.updateOne({ _id: instructorId }, { $set: { status: 'suspended', roles: ['student'] } });
  const service = createFinanceFoundationService({ clock: () => new Date(now) });
  const input = { sourceType: 'operations', sourceId: 'incident-001', reasonCode: 'TRANSFER_UNKNOWN' };
  const hold = await service.runForInstructor({ instructorId }, context => service.openHold(context, input));
  await assert.rejects(service.runForInstructor({ instructorId }, context => service.openHold(context,
    { ...input, reasonCode: 'DIFFERENT_REASON' })), { code: 'FINANCIAL_STATE_CONFLICT' });
  await service.runForInstructor({ instructorId }, context => service.resolveHold(context,
    { holdId: hold.id, resolutionCode: 'CONFIRMED_NOT_SENT' }));
  await assert.rejects(service.runForInstructor({ instructorId }, context => service.openHold(context, input)),
    { code: 'FINANCIAL_STATE_CONFLICT' });
  assert.equal(await FinancialHold.countDocuments(), 1);
});

test('new policy and dependency fields preserve immutable history without changing existing enrollment defaults', async () => {
  const order = await Order.create(orderInput({ policyVersionId: id(), refundWindowSeconds: 14 * 86400 }));
  const payment = await Payment.create({ orderId: order.id, amountMinor: order.amountMinor,
    currency: 'EGP', idempotencyKey: 'legacy-checkout-key', checkoutRequest: {
      orderId: order.id, courseTitle: order.courseTitleSnapshot, amountMinor: order.amountMinor,
      customerEmail: 'test@example.test', idempotencyKey: 'legacy-checkout-key',
      expiresAtSeconds: Math.floor(order.expiresAt.getTime() / 1000),
      successUrl: 'https://example.test/success', cancelUrl: 'https://example.test/cancel',
    } });
  assert.equal(payment.paymentConfirmedAt, null);
  await Payment.updateOne({ _id: payment.id, paymentConfirmedAt: null }, { $set: { paymentConfirmedAt: now } });
  await assert.rejects(Payment.updateOne({ _id: payment.id },
    { $set: { paymentConfirmedAt: new Date(now.getTime() + 1000) } }), /Financial history/);
  const enrollment = await Enrollment.create({ studentId: order.studentId,
    courseId: order.courseId, enrolledAt: now });
  assert.equal(enrollment.revocationReason, null);
  assert.equal(enrollment.revocationSourceOrderId, null);
  await assert.rejects(new EarningEntry({ instructorId: order.instructorId, orderId: order.id,
    type: 'sale', amountMinor: 800, currency: 'EGP', dependentOnPayoutId: id() }).validate(),
  { name: 'ValidationError' });
});

test('legacy readiness inspection is bounded, repeatable and never repairs or changes application history', async () => {
  const legacy = await Order.create(orderInput({ status: 'paid', paidAt: now }));
  const policy = await FinancialPolicyVersion.create(policyInput());
  const confirmed = await Order.create(orderInput({ status: 'paid', policyVersionId: policy.id,
    refundWindowSeconds: 14 * 86400, paymentConfirmedAt: now,
    refundDeadlineAt: new Date(now.getTime() + 14 * 86400_000) }));
  await Order.create(orderInput()); // Pending Checkout is not a falsely paid legacy finding.
  const before = await Order.collection.find({}).sort({ _id: 1 }).toArray();
  const first = await inspectFinancialFoundation({ limit: 1 });
  assert.equal(first.scanned, 1);
  assert.equal(first.dryRun, true);
  assert.ok(first.nextCursor);
  const second = await inspectFinancialFoundation({ afterId: first.nextCursor, limit: 1 });
  assert.equal(second.scanned, 1);
  assert.equal(second.nextCursor, null);
  const report = await inspectFinancialFoundation();
  assert.equal(report.scanned, 2);
  assert.equal(report.requiresReview, 1);
  assert.equal(report.findings[0].orderId, legacy.id);
  assert.deepEqual(report.findings[0].reasonCodes,
    ['MISSING_POLICY', 'MISSING_CONFIRMATION', 'DEADLINE_REQUIRES_REVIEW']);
  assert.equal(report.findings.some(finding => finding.orderId === confirmed.id), false);
  assert.deepEqual(await inspectFinancialFoundation(), report);
  assert.deepEqual(await Order.collection.find({}).sort({ _id: 1 }).toArray(), before);
  assert.equal(await FinancialHold.countDocuments(), 0);
  assert.equal(await AdminAuditEvent.countDocuments(), 0);
});

test('readiness reports missing mappings and unsafe snapshots without accepting unsafe query shapes', async () => {
  const unknown = await Order.create(orderInput({ status: 'paid', policyVersionId: id(), refundWindowSeconds: 10 }));
  await Order.collection.updateOne({ _id: unknown._id }, { $set: { instructorAmountMinor: 999 } });
  const report = await inspectFinancialFoundation();
  assert.ok(report.findings[0].reasonCodes.includes('POLICY_NOT_FOUND'));
  assert.ok(report.findings[0].reasonCodes.includes('INVALID_REVENUE_SPLIT'));
  for (const input of [{ limit: 0 }, { limit: 501 }, { limit: '100' }, { afterId: 'bad' }, { apply: true }]) {
    await assert.rejects(inspectFinancialFoundation(input), { name: 'ZodError' });
  }
});
