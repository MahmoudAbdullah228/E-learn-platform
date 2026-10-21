import mongoose from 'mongoose';
import { protectSnapshot } from './protectSnapshot.js';

const schema = new mongoose.Schema({
  provider: { type: String, enum: ['stripe'], required: true, default: 'stripe', immutable: true },
  eventId: { type: String, required: true, maxlength: 255, immutable: true },
  eventType: { type: String, required: true, maxlength: 255, immutable: true },
  status: { type: String, enum: ['pending', 'processing', 'processed', 'failed', 'ignored'],
    required: true, default: 'pending' },
  // Only the validated financial projection is retained, never customer/card details.
  payload: { type: mongoose.Schema.Types.Mixed, required: true, select: false, immutable: true },
  attempts: { type: Number, required: true, default: 0, min: 0, validate: Number.isInteger },
  lastReceivedAt: { type: Date, required: true },
  processedAt: { type: Date, default: null },
  lastError: { type: String, default: null, maxlength: 100 },
  availableAt: { type: Date, required: true },
  leaseId: { type: String, default: null, select: false },
  leaseUntil: { type: Date, default: null },
}, { timestamps: true });
protectSnapshot(schema, ['provider', 'eventId', 'eventType', 'payload']);
schema.index({ provider: 1, eventId: 1 }, { unique: true });
schema.index({ status: 1, availableAt: 1, leaseUntil: 1 });
export const WebhookEvent = mongoose.model('WebhookEvent', schema);
