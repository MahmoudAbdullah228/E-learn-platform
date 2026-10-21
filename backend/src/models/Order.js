import mongoose from 'mongoose';
import { protectSnapshot } from './protectSnapshot.js';

const reference = ref => ({ type: mongoose.Schema.Types.ObjectId, ref, required: true,
  immutable: true });
const money = { type: Number, required: true, min: 0, max: Number.MAX_SAFE_INTEGER,
  validate: Number.isSafeInteger, immutable: true };
const schema = new mongoose.Schema({
  studentId: reference('User'), courseId: reference('Course'), instructorId: reference('User'),
  courseTitleSnapshot: { type: String, required: true, maxlength: 160, immutable: true },
  amountMinor: { ...money, min: 1 },
  currency: { type: String, enum: ['EGP'], required: true, immutable: true },
  commissionBps: { type: Number, required: true, min: 0, max: 10_000,
    validate: Number.isInteger, immutable: true },
  platformAmountMinor: money, instructorAmountMinor: money,
  status: { type: String, enum: ['pending', 'paid', 'failed', 'cancelled', 'refunded'],
    default: 'pending', required: true },
  expiresAt: { type: Date, required: true, immutable: true },
  paidAt: { type: Date, default: null },
  purchaseSlotActive: { type: Boolean, default: true, required: true },
}, { timestamps: true });
protectSnapshot(schema, ['studentId', 'courseId', 'instructorId', 'courseTitleSnapshot',
  'amountMinor', 'currency', 'commissionBps', 'platformAmountMinor', 'instructorAmountMinor', 'expiresAt']);
schema.pre('validate', function validateRevenueSplit() {
  if (![this.amountMinor, this.platformAmountMinor, this.instructorAmountMinor, this.commissionBps]
    .every(Number.isSafeInteger)) {
    this.invalidate('amountMinor', 'Amounts and commission must be safe integers');
    return;
  }
  if (this.platformAmountMinor + this.instructorAmountMinor !== this.amountMinor
      || BigInt(this.platformAmountMinor ?? 0)
        !== BigInt(this.amountMinor ?? 0) * BigInt(this.commissionBps ?? 0) / 10_000n) {
    this.invalidate('platformAmountMinor', 'Revenue split must match the snapshot amount');
  }
});
schema.index({ studentId: 1, courseId: 1 }, { unique: true,
  partialFilterExpression: { purchaseSlotActive: true } });
schema.index({ studentId: 1, createdAt: -1, _id: -1 });
schema.index({ studentId: 1, status: 1, createdAt: -1, _id: -1 });
schema.index({ courseId: 1, createdAt: -1, _id: -1 });
schema.index({ status: 1, createdAt: -1, _id: -1 });
schema.index({ status: 1, expiresAt: 1 });
export const Order = mongoose.model('Order', schema);
