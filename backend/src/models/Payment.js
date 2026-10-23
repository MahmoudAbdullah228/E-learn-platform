import mongoose from 'mongoose';
import { protectSnapshot } from './protectSnapshot.js';

const checkoutRequest = new mongoose.Schema({
  orderId: { type: String, required: true },
  courseTitle: { type: String, required: true },
  amountMinor: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  customerEmail: { type: String, required: true },
  idempotencyKey: { type: String, required: true },
  expiresAtSeconds: { type: Number, required: true, validate: Number.isSafeInteger },
  successUrl: { type: String, required: true }, cancelUrl: { type: String, required: true },
}, { _id: false });
checkoutRequest.eachPath((path, schemaType) => {
  void path;
  schemaType.immutable(true);
});
const schema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
  provider: { type: String, enum: ['stripe'], default: 'stripe', required: true, immutable: true },
  idempotencyKey: { type: String, required: true, immutable: true, select: false },
  checkoutSessionId: { type: String, default: null, select: false },
  paymentIntentId: { type: String, default: null, select: false },
  amountMinor: { type: Number, required: true, min: 1, validate: Number.isSafeInteger,
    immutable: true },
  currency: { type: String, enum: ['EGP'], required: true, immutable: true },
  status: { type: String, enum: ['created', 'processing', 'succeeded', 'failed', 'refunded'],
    default: 'created', required: true },
  paidAt: { type: Date, default: null },
  checkoutRequest: { type: checkoutRequest, required: true, immutable: true, select: false },
  checkoutLeaseId: { type: String, default: null, select: false },
  checkoutLeaseUntil: { type: Date, default: null, select: false },
}, { timestamps: true });
protectSnapshot(schema, ['orderId', 'provider', 'idempotencyKey', 'amountMinor', 'currency',
  'checkoutRequest']);
schema.pre('validate', function validateCheckoutSnapshot() {
  if (!this.isNew && !this.isModified('checkoutRequest')) return;
  const snapshot = this.checkoutRequest;
  if (!snapshot || snapshot.orderId !== this.orderId?.toString()
      || snapshot.amountMinor !== this.amountMinor
      || snapshot.idempotencyKey !== this.idempotencyKey) {
    this.invalidate('checkoutRequest', 'Checkout snapshot must match the payment');
  }
});
schema.index({ orderId: 1 }, { unique: true });
schema.index({ provider: 1, idempotencyKey: 1 }, { unique: true });
for (const field of ['checkoutSessionId', 'paymentIntentId']) {
  schema.index({ provider: 1, [field]: 1 }, { unique: true,
    partialFilterExpression: { [field]: { $type: 'string' } } });
}
schema.index({ status: 1, checkoutLeaseUntil: 1 });
export const Payment = mongoose.model('Payment', schema);
