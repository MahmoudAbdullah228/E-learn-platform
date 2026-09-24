import mongoose from 'mongoose';

const refreshSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    familyId: { type: String, required: true, unique: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    usedTokenHashes: { type: [String], default: [], select: false },
    tokenVersion: { type: Number, required: true, min: 0 },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: {
      type: String,
      enum: ['logout', 'logout_all', 'reuse_detected', 'account_suspended'],
      default: null,
    },
  },
  { timestamps: true },
);

refreshSessionSchema.index({ usedTokenHashes: 1 });
refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshSessionSchema.index({ userId: 1, revokedAt: 1 });

export const RefreshSession = mongoose.model('RefreshSession', refreshSessionSchema);
