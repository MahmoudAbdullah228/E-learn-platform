import assert from 'node:assert/strict';
import test from 'node:test';

import { z } from 'zod';

import { auditInputSchema } from '../src/modules/audit/audit.schemas.js';
import { appendAuditEvent } from '../src/modules/audit/audit.service.js';
import { assertFinancialTransition, financialDeadlines, fullRefundLedgerAction } from '../src/modules/finance/finance.policy.js';
import { refundRequestIdentity } from '../src/modules/finance/financeIdentity.js';
import { amountSchema, financialIdSchema, financialKeySchema, financialRangeSchema,
  financialReasonSchema, financialPolicyInputSchema, positiveAmountSchema, signedAmountSchema,
  transferReferenceSchema } from '../src/modules/finance/finance.schemas.js';
import { sumMinorUnits } from '../src/utils/money.js';

const objectId = '0123456789abcdef01234567';
const reason = 'Approved refund for the test purchase';

test('financial primitives reject coercion, unsafe integers, fractions and unknown currency assumptions', () => {
  for (const amount of ['100', 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(signedAmountSchema.safeParse(amount).success, false);
  }
  assert.equal(amountSchema.safeParse(-1).success, false);
  assert.equal(positiveAmountSchema.safeParse(0).success, false);
  assert.equal(signedAmountSchema.parse(-Number.MAX_SAFE_INTEGER), -Number.MAX_SAFE_INTEGER);
  assert.equal(financialIdSchema.parse(objectId.toUpperCase()), objectId);
  assert.equal(financialIdSchema.safeParse('short').success, false);
});

test('financial keys, reasons and references have explicit normalized boundaries', () => {
  assert.equal(financialKeySchema.safeParse('a'.repeat(16)).success, true);
  for (const key of ['short', 'a'.repeat(129), 'x'.repeat(16) + ' ', 'x'.repeat(16) + '\n']) {
    assert.equal(financialKeySchema.safeParse(key).success, false);
  }
  assert.equal(financialReasonSchema.parse(`  ${reason}  `), reason);
  for (const value of ['too short', 'r'.repeat(501), 'Hidden\u200B reason', 'Hidden\nreason']) {
    assert.equal(financialReasonSchema.safeParse(value).success, false);
  }
  assert.equal(transferReferenceSchema.parse('  transfer-001  '), 'TRANSFER-001');
  assert.equal(transferReferenceSchema.safeParse('https://bank.test/receipt').success, false);
});

test('exact financial sums retain negative carry and tolerate cancelling intermediate overflow', () => {
  assert.equal(sumMinorUnits([]), 0);
  assert.equal(sumMinorUnits([800, -300, 400]), 900);
  assert.equal(sumMinorUnits([Number.MAX_SAFE_INTEGER, 1, -1]), Number.MAX_SAFE_INTEGER);
  assert.equal(sumMinorUnits([-Number.MAX_SAFE_INTEGER, -1, 1]), -Number.MAX_SAFE_INTEGER);
  for (const input of [[Number.MAX_SAFE_INTEGER, 1], [-Number.MAX_SAFE_INTEGER, -1]]) {
    assert.throws(() => sumMinorUnits(input), RangeError);
  }
  for (const input of [[1, '2'], [1.5], [NaN], null]) assert.throws(() => sumMinorUnits(input), TypeError);
});

test('versioned deadlines use elapsed UTC seconds and never mutate the confirmation timestamp', () => {
  const confirmed = new Date('2026-10-25T22:30:00Z');
  const input = { paymentConfirmedAt: confirmed, refundWindowSeconds: 14 * 86400 };
  const result = financialDeadlines(input);
  assert.equal(result.refundDeadlineAt.toISOString(), '2026-11-08T22:30:00.000Z');
  assert.equal(result.eligibleAt.getTime(), result.refundDeadlineAt.getTime());
  assert.notEqual(result.eligibleAt, result.refundDeadlineAt);
  assert.equal(confirmed.toISOString(), '2026-10-25T22:30:00.000Z');
  for (const change of [{ refundWindowSeconds: 0 }, { refundWindowSeconds: '1209600' },
    { paymentConfirmedAt: new Date(NaN) }, { paidAt: confirmed }]) {
    assert.throws(() => financialDeadlines({ ...input, ...change }), z.ZodError);
  }
  assert.throws(() => financialDeadlines({ paymentConfirmedAt: new Date(8640000000000000),
    refundWindowSeconds: 1 }), RangeError);
});

test('financial query ranges are bounded, ordered and strict', () => {
  const from = new Date('2026-01-01T00:00:00Z');
  assert.ok(financialRangeSchema.safeParse({ from, to: new Date('2026-02-01') }).success);
  for (const to of [from, new Date('2025-01-01'), new Date('2028-01-01')]) {
    assert.equal(financialRangeSchema.safeParse({ from, to }).success, false);
  }
  assert.equal(financialRangeSchema.safeParse({ from, to: new Date('2026-02-01'), limit: 1 }).success, false);
});

test('policy validation requires explicit activation, full-refund mode and approval provenance', () => {
  const input = { version: 'mvp-s3-policy-v1', effectiveFrom: new Date('2026-11-18T00:00:00Z'),
    approvedAt: new Date('2026-11-17T00:00:00Z'), refundWindowSeconds: 14 * 86400,
    refundMode: 'full', lateAdminOverrideAllowed: true, eligibilityRule: 'after_refund_window_without_holds',
    approvalSource: 'product_delegation', approvalReference: 's3-policy-register' };
  assert.equal(financialPolicyInputSchema.safeParse(input).success, true);
  for (const change of [{ refundMode: 'partial' }, { active: true }, { approvalSource: 'admin_approval' },
    { effectiveFrom: new Date('2026-11-16') }, { refundWindowSeconds: 0 }]) {
    assert.equal(financialPolicyInputSchema.safeParse({ ...input, ...change }).success, false);
  }
});

test('refund fingerprints use normalized intent and provider keys never reuse a client header', () => {
  const input = { orderId: objectId, idempotencyKey: 'same-client-key-001', reason };
  const first = refundRequestIdentity(input);
  const second = refundRequestIdentity({ reason: ` ${reason} `, idempotencyKey: input.idempotencyKey,
    orderId: objectId.toUpperCase(), overrideWindow: false });
  assert.equal(first.requestFingerprint, second.requestFingerprint);
  assert.notEqual(first.providerIdempotencyKey, second.providerIdempotencyKey);
  assert.notEqual(first.providerIdempotencyKey, input.idempotencyKey);
  assert.match(first.providerIdempotencyKey, /^refund_[a-f\d-]{36}$/);
  assert.notEqual(first.requestFingerprint, refundRequestIdentity({ ...input, overrideWindow: true }).requestFingerprint);
  assert.notEqual(first.requestFingerprint, refundRequestIdentity({ ...input, reason: 'Different approved explanation' }).requestFingerprint);
  assert.throws(() => refundRequestIdentity({ ...input, amountMinor: 1 }), z.ZodError);
});

test('financial transitions reject terminal regression and unknown or prototype state names', () => {
  for (const args of [{ entity: 'refund', from: 'requested', to: 'succeeded' },
    { entity: 'refund', from: 'requires_reconciliation', to: 'pending' },
    { entity: 'payout', from: 'draft', to: 'pending' },
    { entity: 'payout', from: 'paid', to: 'paid' },
    { entity: 'earning', from: 'included_in_payout', to: 'eligible' }]) {
    assert.doesNotThrow(() => assertFinancialTransition(args));
  }
  for (const args of [{ entity: 'refund', from: 'succeeded', to: 'failed' },
    { entity: 'payout', from: 'paid', to: 'cancelled' },
    { entity: 'payout', from: 'draft', to: 'paid' },
    { entity: 'earning', from: 'pending', to: 'included_in_payout' },
    { entity: '__proto__', from: 'toString', to: 'toString' },
    { entity: 'refund', from: 'constructor', to: 'succeeded' }]) {
    assert.throws(() => assertFinancialTransition(args), { code: 'FINANCIAL_STATE_CONFLICT' });
  }
});

test('refund ledger policy differentiates unpaid, drafted, unknown and paid settlement effects', () => {
  const cases = [
    [{ saleStatus: 'pending' }, 'reverse_sale'], [{ saleStatus: 'eligible' }, 'reverse_sale'],
    [{ saleStatus: 'reversed' }, 'already_reversed'],
    [{ saleStatus: 'included_in_payout', payoutStatus: 'draft' }, 'cancel_draft_and_reverse_sale'],
    [{ saleStatus: 'included_in_payout', payoutStatus: 'pending' }, 'defer_adjustment_until_transfer_resolution'],
    [{ saleStatus: 'included_in_payout', payoutStatus: 'paid' }, 'create_eligible_adjustment'],
  ];
  for (const [input, expected] of cases) assert.equal(fullRefundLedgerAction(input), expected);
  for (const input of [{ saleStatus: 'eligible', payoutStatus: 'paid' },
    { saleStatus: 'included_in_payout' }, { saleStatus: 'invalid' }]) {
    assert.throws(() => fullRefundLedgerAction(input), { code: 'FINANCIAL_STATE_CONFLICT' });
  }
});

test('audit input is minimal, role-specific and rejects arbitrary secret-bearing payloads', async () => {
  const base = { actorType: 'system', action: 'refund.succeeded', targetType: 'refund', targetId: objectId };
  assert.ok(auditInputSchema.safeParse(base).success);
  for (const change of [{ actorId: objectId }, { rawProviderPayload: { secret: 'private' } },
    { action: 'unknown.write' }, { actorType: 'user' }, { result: { passwordHash: 'private' } }]) {
    assert.equal(auditInputSchema.safeParse({ ...base, ...change }).success, false);
  }
  assert.equal(auditInputSchema.safeParse({ ...base, actorType: 'user', actorId: objectId,
    idempotencyKey: 'audit-command-key', requestFingerprint: 'a'.repeat(64),
    result: { resourceId: objectId, status: 'succeeded', httpStatus: 202 } }).success, true);
  await assert.rejects(appendAuditEvent({ input: base, occurredAt: new Date() }), TypeError);
});
