import mongoose from 'mongoose';
import { protectSnapshot } from './protectSnapshot.js';
import { protectWriteOnce } from './protectFinancialHistory.js';

const schema = new mongoose.Schema({
  instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
  refundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Refund', default: null, immutable: true },
  payoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payout', default: null },
  type: { type: String, enum: ['sale', 'refund_adjustment'], required: true, immutable: true },
  amountMinor: { type: Number, required: true, min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER,
    validate: Number.isSafeInteger, immutable: true },
  currency: { type: String, enum: ['EGP'], required: true, immutable: true },
  status: { type: String, enum: ['pending', 'eligible', 'included_in_payout', 'reversed'],
    required: true, default: 'pending' },
  eligibleAt: { type: Date, default: null },
  policyVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialPolicyVersion', default: null },
  dependentOnPayoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payout', default: null },
  eligibilityLeaseId: { type: String, default: null, maxlength: 64, select: false },
  eligibilityLeaseUntil: { type: Date, default: null, select: false },
  eligibilityNextCheckAt: { type: Date, default: null, select: false },
  eligibilityCheckedAt: { type: Date, default: null, select: false },
  eligibilityCheckCode: { type: String, default: null, maxlength: 80, match: /^[A-Z][A-Z0-9_]+$/, select: false },
  eligibilityAttempts: { type: Number, default: 0, min: 0, max: Number.MAX_SAFE_INTEGER,
    validate: Number.isSafeInteger, select: false },
}, { timestamps: true });
protectSnapshot(schema, ['instructorId', 'orderId', 'refundId', 'type', 'amountMinor', 'currency',
  'policyVersionId', 'dependentOnPayoutId']);
protectWriteOnce(schema, ['eligibleAt']);
schema.pre('validate', function validateLedgerSign() {
  if (this.dependentOnPayoutId && this.type !== 'refund_adjustment') {
    this.invalidate('dependentOnPayoutId', 'Only refund adjustments may depend on a transfer outcome');
  }
  if (this.type === 'sale' && (this.amountMinor < 0 || this.refundId)) {
    this.invalidate('amountMinor', 'Sale must have a nonnegative amount and no refund');
  }
  if (this.type === 'refund_adjustment' && (this.amountMinor >= 0 || !this.refundId)) {
    this.invalidate('amountMinor', 'Refund adjustment must be negative and reference a refund');
  }
});
schema.index({ orderId: 1 }, { unique: true, partialFilterExpression: { type: 'sale' } });
schema.index({ refundId: 1 }, { unique: true,
  partialFilterExpression: { type: 'refund_adjustment', refundId: { $type: 'objectId' } } });
schema.index({ instructorId: 1, status: 1, createdAt: 1 });
schema.index({ instructorId: 1, currency: 1, createdAt: -1, _id: -1 });
schema.index({ status: 1, eligibleAt: 1, _id: 1 });
schema.index({ dependentOnPayoutId: 1, status: 1 });
schema.index({ payoutId: 1 });
schema.index({ status: 1, type: 1, eligibleAt: 1, _id: 1 });
export const EarningEntry = mongoose.model('EarningEntry', schema);
