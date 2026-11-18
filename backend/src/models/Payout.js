import mongoose from 'mongoose';

import { financialKeyField, financialModelOptions, financialReference, fingerprintField,
  requireModelCondition, safeIntegerField } from './financialFields.js';
import { protectFinancialHistory, protectWriteOnce } from './protectFinancialHistory.js';
import { containsUnsafeCharacter } from '../utils/textValidation.js';

export const payoutStatuses = ['draft', 'pending', 'paid', 'cancelled'];
const schema = new mongoose.Schema({
  instructorId: financialReference('User'),
  amountMinor: { ...safeIntegerField(1), required: true },
  currency: { type: String, enum: ['EGP'], required: true },
  lineCount: { ...safeIntegerField(1), required: true },
  periodStart: { type: Date, required: true }, periodEnd: { type: Date, required: true },
  cutoffAt: { type: Date, required: true },
  createdBy: financialReference('User'),
  idempotencyKey: { ...financialKeyField, required: true },
  requestFingerprint: { ...fingerprintField, required: true },
  status: { type: String, enum: payoutStatuses, required: true, default: 'draft' },
  revision: { ...safeIntegerField(), default: 0 },
  sealedAt: { type: Date, default: null }, sealedBy: financialReference('User', false),
  transferAttemptId: { type: String, default: null, match: /^[a-f\d-]{36}$/ },
  transferMethod: { type: String, enum: ['bank_transfer', 'manual_transfer', 'test_simulation', null], default: null },
  transferReference: { type: String, default: null, trim: true, uppercase: true,
    minlength: 3, maxlength: 128, match: /^[A-Z0-9][A-Z0-9._/-]+$/ },
  transferOutcome: { type: String, enum: ['not_started', 'unknown', 'confirmed_paid', 'confirmed_not_sent'],
    required: true, default: 'not_started' },
  paidAt: { type: Date, default: null }, paidBy: financialReference('User', false),
  cancelledAt: { type: Date, default: null }, cancelledBy: financialReference('User', false),
  cancellationReason: { type: String, default: null, minlength: 10, maxlength: 500,
    validate: value => value == null || !containsUnsafeCharacter(value) },
}, financialModelOptions);
schema.pre('validate', function validatePayout() {
  requireModelCondition(this, this.periodStart < this.periodEnd && this.cutoffAt >= this.periodStart
    && this.cutoffAt <= this.periodEnd, 'cutoffAt', 'Payout period and cutoff must be consistent');
  requireModelCondition(this, !['pending', 'paid'].includes(this.status)
    || (this.sealedAt && this.sealedBy && this.transferAttemptId && this.transferMethod),
  'sealedAt', 'Pending and paid payouts require a sealed transfer attempt');
  requireModelCondition(this, this.status !== 'paid' || (this.paidAt && this.paidBy
    && this.transferReference && this.transferOutcome === 'confirmed_paid'),
  'paidAt', 'Paid payouts require confirmed transfer evidence');
  requireModelCondition(this, this.status !== 'cancelled' || (this.cancelledAt && this.cancelledBy
    && this.cancellationReason && this.transferOutcome === 'confirmed_not_sent'),
  'cancelledAt', 'Cancellation requires a confirmed non-transfer and audit reason');
  requireModelCondition(this, this.status !== 'draft' || (!this.sealedAt && !this.sealedBy
    && !this.transferAttemptId && !this.transferMethod && !this.transferReference
    && this.transferOutcome === 'not_started'), 'status', 'Draft payouts cannot contain a sealed transfer');
  requireModelCondition(this, this.status === 'paid' || (!this.paidAt && !this.paidBy),
    'paidAt', 'Only paid payouts contain payment confirmation');
  requireModelCondition(this, this.status === 'cancelled'
    || (!this.cancelledAt && !this.cancelledBy && !this.cancellationReason),
  'cancelledAt', 'Only cancelled payouts contain cancellation confirmation');
  requireModelCondition(this, this.status !== 'cancelled' || !this.transferReference,
    'transferReference', 'A cancelled payout cannot claim a successful transfer reference');
});
protectFinancialHistory(schema, { immutableFields: ['instructorId', 'amountMinor', 'currency',
  'lineCount', 'periodStart', 'periodEnd', 'cutoffAt', 'createdBy', 'idempotencyKey', 'requestFingerprint'] });
protectWriteOnce(schema, ['sealedAt', 'sealedBy', 'transferAttemptId', 'transferMethod', 'transferReference',
  'paidAt', 'paidBy', 'cancelledAt', 'cancelledBy', 'cancellationReason']);
schema.index({ instructorId: 1, currency: 1 }, { unique: true,
  partialFilterExpression: { status: { $in: ['draft', 'pending'] } } });
schema.index({ createdBy: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ transferAttemptId: 1 }, { unique: true,
  partialFilterExpression: { transferAttemptId: { $type: 'string' } } });
schema.index({ transferMethod: 1, transferReference: 1 }, { unique: true,
  partialFilterExpression: { transferMethod: { $type: 'string' }, transferReference: { $type: 'string' } } });
schema.index({ instructorId: 1, createdAt: -1, _id: -1 });
schema.index({ status: 1, createdAt: 1 });
export const Payout = mongoose.model('Payout', schema);
