import mongoose from 'mongoose';

// Keep the original collection name so pending verification jobs survive the
// Story 1.4 model generalization.
const authEmailRequestSchema = new mongoose.Schema({
  email: { type: String, required: true },
  purpose: {
    type: String,
    enum: ['email_verification', 'password_reset'],
    default: 'email_verification',
    required: true,
  },
  availableAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  leaseId: { type: String, default: null },
  attempts: { type: Number, default: 0 },
}, { timestamps: true, collection: 'verificationrequests' });

authEmailRequestSchema.index({ availableAt: 1 });
authEmailRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthEmailRequest = mongoose.model('AuthEmailRequest', authEmailRequestSchema);
