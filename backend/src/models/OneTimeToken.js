import mongoose from 'mongoose';

const oneTimeTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tokenHash: {
      type: String,
      required: true,
      select: false,
    },
    purpose: {
      type: String,
      enum: ['email_verification', 'password_reset'],
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

oneTimeTokenSchema.index({ tokenHash: 1 }, { unique: true });
oneTimeTokenSchema.index({ userId: 1, purpose: 1 }, { unique: true });
oneTimeTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OneTimeToken = mongoose.model('OneTimeToken', oneTimeTokenSchema);
