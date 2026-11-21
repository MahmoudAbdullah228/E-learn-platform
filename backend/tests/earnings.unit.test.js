import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { evaluateSaleEligibility } from '../src/modules/earnings/eligibility.policy.js';
import { eligibilityOperationSchema, eligibilitySummarySchema } from '../src/modules/earnings/earnings.schemas.js';
import { createEligibilityOperationsService } from '../src/modules/earnings/eligibilityOperations.service.js';
import { createEarningsEligibilityWorker } from '../src/services/earningsEligibilityWorker.service.js';

const id = value => value.repeat(24);
const now = new Date('2026-11-18T12:00:00Z');
function proof() {
  const confirmed = new Date(now.getTime() - 14 * 86400_000);
  const order = { _id: id('1'), instructorId: id('2'), status: 'paid', purchaseSlotActive: true,
    amountMinor: 1000, instructorAmountMinor: 800, platformAmountMinor: 200, commissionBps: 2000, currency: 'EGP',
    policyVersionId: id('3'), refundWindowSeconds: 14 * 86400, paymentConfirmedAt: confirmed, refundDeadlineAt: new Date(now),
    createdAt: new Date(confirmed.getTime() - 1000) };
  const entry = { _id: id('4'), orderId: order._id, instructorId: order.instructorId, type: 'sale', status: 'pending',
    amountMinor: 800, currency: 'EGP', policyVersionId: id('3'), eligibleAt: new Date(now), payoutId: null, refundId: null, dependentOnPayoutId: null };
  const payment = { _id: id('5'), orderId: order._id, provider: 'stripe', paymentIntentId: 'pi_test', status: 'succeeded',
    amountMinor: 1000, currency: 'EGP', paymentConfirmedAt: confirmed };
  const policy = { _id: id('3'), version: 'v1', effectiveFrom: new Date(confirmed.getTime() - 86400_000),
    approvedAt: new Date(confirmed.getTime() - 2 * 86400_000), refundMode: 'full', refundWindowSeconds: 14 * 86400,
    lateAdminOverrideAllowed: true, eligibilityRule: 'after_refund_window_without_holds',
    approvalSource: 'product_delegation', approvedBy: null, approvalReference: 'test-approval' };
  return { order, entry, payment, policy, now: new Date(now) };
}
test('eligibility uses an exact elapsed UTC deadline, including a policy-defined window and no early rounding', () => {
  const f = proof(); assert.equal(evaluateSaleEligibility(f).eligible, true);
  f.now = new Date(now.getTime() - 1); assert.equal(evaluateSaleEligibility(f).code, 'REFUND_WINDOW_OPEN');
  f.order.refundWindowSeconds = 3600; f.policy.refundWindowSeconds = 3600;
  f.order.refundDeadlineAt = new Date(f.order.paymentConfirmedAt.getTime() + 3600_000); f.entry.eligibleAt = f.order.refundDeadlineAt;
  assert.equal(evaluateSaleEligibility(f).deadline.getTime(), f.order.refundDeadlineAt.getTime());
});
test('missing policy/trusted confirmation is legacy review, never inferred from paidAt or a supplied current default', () => {
  for (const mutate of [f => { f.order.policyVersionId = null; }, f => { f.entry.policyVersionId = null; },
    f => { f.order.paymentConfirmedAt = null; }, f => { f.payment.paymentConfirmedAt = null; }]) {
    const f = proof(); f.order.paidAt = new Date(now.getTime() - 90 * 86400_000); mutate(f);
    assert.equal(evaluateSaleEligibility(f).code, 'EARNINGS_LEGACY_REQUIRES_REVIEW');
  }
});
test('mismatched policy/proof/source/split/status or eligibility dates fail closed', () => {
  const mutations = [f => { f.policy._id = id('9'); }, f => { f.policy.approvalSource = 'unknown'; },
    f => { f.policy.effectiveFrom = new Date(now); }, f => { f.policy.approvalReference = ''; },
    f => { f.order.status = 'refunded'; }, f => { f.order.purchaseSlotActive = false; },
    f => { f.payment.status = 'processing'; }, f => { f.payment.amountMinor = 999; }, f => { f.payment.currency = 'USD'; },
    f => { f.payment.paymentIntentId = null; }, f => { f.payment.paymentConfirmedAt = new Date(0); },
    f => { f.entry.instructorId = id('9'); }, f => { f.entry.amountMinor = -1; }, f => { f.entry.payoutId = id('9'); },
    f => { f.entry.type = 'refund_adjustment'; }, f => { f.entry.eligibleAt = new Date(now.getTime() - 1); },
    f => { f.order.platformAmountMinor = 201; }, f => { f.order.refundDeadlineAt = new Date(0); }];
  for (const mutate of mutations) { const f = proof(); mutate(f); assert.equal(evaluateSaleEligibility(f).code, 'EARNINGS_EVIDENCE_REQUIRES_REVIEW'); }
});
test('a missing sale eligibility date can be derived only from matching immutable confirmation/policy proof', () => {
  const f = proof(); f.entry.eligibleAt = null;
  assert.equal(evaluateSaleEligibility(f).eligible, true); assert.equal(evaluateSaleEligibility(f).deadline.getTime(), now.getTime());
  f.policy.refundWindowSeconds = 7 * 86400; assert.equal(evaluateSaleEligibility(f).eligible, false);
});
test('eligibility operation is dry-run by default and strict about IDs, booleans and privileged fields', async () => {
  const calls = []; const operations = createEligibilityOperationsService({ worker: { async processNext(input) { calls.push(input); return true; } } });
  assert.deepEqual(await operations.run({}), { dryRun: true, evaluated: false }); assert.equal(calls.length, 0);
  assert.deepEqual(await operations.run({ entryId: id('1'), execute: true }), { dryRun: false, evaluated: true });
  assert.deepEqual(calls, [{ entryId: id('1') }]);
  for (const input of [{ entryId: 'bad' }, { execute: 'true' }, { amountMinor: 1 }, { policyVersionId: id('1') }, { force: true }]) {
    assert.equal(eligibilityOperationSchema.safeParse(input).success, false);
  }
  assert.equal(eligibilitySummarySchema.safeParse({ instructorId: id('1'), currency: 'USD' }).success, false);
});

test('worker configuration cannot start unbounded timer batches or an indefinite shutdown drain', () => {
  for (const options of [{ intervalMs: 0 }, { intervalMs: 3_600_001 }, { batchSize: 0 }, { batchSize: 101 },
    { shutdownTimeoutMs: 0 }, { shutdownTimeoutMs: Infinity }]) assert.throws(() => createEarningsEligibilityWorker(options));
});

test('CLI rejects missing selected IDs, duplicate and unknown flags before executing an arbitrary candidate', () => {
  const script = fileURLToPath(new URL('../scripts/earnings-eligibility.js', import.meta.url));
  for (const args of [['--execute', '--entry-id'], ['--entry-id', '--execute'], ['--execute', '--execute'], ['--force']]) {
    const result = spawnSync(process.execPath, [script, ...args], { env: process.env, encoding: 'utf8', timeout: 10_000 });
    assert.equal(result.status, 1);
  }
  const dryRun = spawnSync(process.execPath, [script], { env: process.env, encoding: 'utf8', timeout: 10_000 });
  assert.equal(dryRun.status, 0);
});
