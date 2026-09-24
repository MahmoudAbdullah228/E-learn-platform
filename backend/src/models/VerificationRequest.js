import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  email: { type: String, required: true },
  availableAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  leaseId: { type: String, default: null },
  attempts: { type: Number, default: 0 },
}, { timestamps: true });

schema.index({ availableAt: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const VerificationRequest = mongoose.model('VerificationRequest', schema);
