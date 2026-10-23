import mongoose from 'mongoose';
import { protectSnapshot } from './protectSnapshot.js';

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
}, { timestamps: true });
protectSnapshot(schema, ['instructorId', 'orderId', 'refundId', 'type', 'amountMinor', 'currency']);
schema.pre('validate', function validateLedgerSign() {
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
export const EarningEntry = mongoose.model('EarningEntry', schema);
