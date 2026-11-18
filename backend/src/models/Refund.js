import mongoose from 'mongoose';

import { financialKeyField, financialModelOptions, financialReference, fingerprintField,
  requireModelCondition, safeCodeField, safeIntegerField } from './financialFields.js';
import { protectFinancialHistory, protectWriteOnce } from './protectFinancialHistory.js';
import { containsUnsafeCharacter } from '../utils/textValidation.js';

export const refundStatuses = ['requested', 'processing', 'pending', 'requires_reconciliation',
  'succeeded', 'failed', 'cancelled'];
const schema = new mongoose.Schema({
  orderId: financialReference('Order'), paymentId: financialReference('Payment'),
  instructorId: financialReference('User'),
  provider: { type: String, enum: ['stripe'], required: true, default: 'stripe' },
  source: { type: String, enum: ['admin', 'provider'], required: true },
  kind: { type: String, enum: ['full', 'partial'], required: true },
  amountMinor: { ...safeIntegerField(1), required: true },
  paymentAmountMinor: { ...safeIntegerField(1), required: true },
  currency: { type: String, enum: ['EGP'], required: true },
  initiatedBy: financialReference('User', false),
  idempotencyKey: { ...financialKeyField, default: null },
  requestFingerprint: { ...fingerprintField, default: null },
  providerIdempotencyKey: { type: String, default: null, select: false,
    match: /^refund_[a-f\d-]{36}$/ },
  providerRefundId: { type: String, default: null, select: false, maxlength: 255, match: /^re_[A-Za-z0-9_]+$/ },
  reason: { type: String, default: null, trim: true, minlength: 10, maxlength: 500,
    validate: value => value == null || !containsUnsafeCharacter(value) },
  overrideWindow: { type: Boolean, required: true, default: false },
  status: { type: String, enum: refundStatuses, required: true, default: 'requested' },
  completedAt: { type: Date, default: null },
  lastReconciledAt: { type: Date, default: null },
  failureCode: { ...safeCodeField, default: null },
  leaseId: { type: String, default: null, maxlength: 64, select: false },
  leaseUntil: { type: Date, default: null, select: false },
  nextAttemptAt: { type: Date, default: null },
  attempts: { ...safeIntegerField(), default: 0 },
  revision: { ...safeIntegerField(), default: 0 },
}, financialModelOptions);
schema.pre('validate', function validateRefund() {
  const local = this.source === 'admin';
  requireModelCondition(this, this.kind === 'full' ? this.amountMinor === this.paymentAmountMinor
    : this.amountMinor < this.paymentAmountMinor, 'amountMinor', 'Refund amount must match its kind');
  // Identity fields are immutable after insert and hidden on ordinary queries. Do not
  // mistake an unselected immutable key for missing identity on a later document save.
  if (this.isNew) {
    requireModelCondition(this, !local || (this.kind === 'full' && this.initiatedBy
      && this.idempotencyKey && this.requestFingerprint && this.providerIdempotencyKey && this.reason),
    'source', 'Local full refunds require their actor, identity and reason');
    requireModelCondition(this, local || (!this.initiatedBy && !this.idempotencyKey
      && !this.requestFingerprint && !this.providerIdempotencyKey && this.providerRefundId && !this.overrideWindow),
    'source', 'Provider refunds require their provider identity, not a local actor or request');
  }
  requireModelCondition(this, this.status !== 'succeeded' || (this.providerRefundId && this.completedAt),
    'completedAt', 'Successful refunds require provider identity and completion time');
});
protectFinancialHistory(schema, { immutableFields: ['orderId', 'paymentId', 'instructorId',
  'provider', 'source', 'kind', 'amountMinor', 'paymentAmountMinor', 'currency', 'initiatedBy',
  'idempotencyKey', 'requestFingerprint', 'providerIdempotencyKey', 'reason', 'overrideWindow'] });
protectWriteOnce(schema, ['providerRefundId', 'completedAt']);
schema.index({ provider: 1, providerRefundId: 1 }, { unique: true,
  partialFilterExpression: { providerRefundId: { $type: 'string' } } });
schema.index({ provider: 1, providerIdempotencyKey: 1 }, { unique: true,
  partialFilterExpression: { providerIdempotencyKey: { $type: 'string' } } });
schema.index({ initiatedBy: 1, idempotencyKey: 1 }, { unique: true,
  partialFilterExpression: { initiatedBy: { $type: 'objectId' }, idempotencyKey: { $type: 'string' } } });
schema.index({ paymentId: 1 }, { unique: true,
  partialFilterExpression: { kind: 'full', status: { $in: [
    'requested', 'processing', 'pending', 'requires_reconciliation', 'succeeded',
  ] } } });
schema.index({ status: 1, nextAttemptAt: 1, leaseUntil: 1 });
schema.index({ orderId: 1, createdAt: -1, _id: -1 });
export const Refund = mongoose.model('Refund', schema);
