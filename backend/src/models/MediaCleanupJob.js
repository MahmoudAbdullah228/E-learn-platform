import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset', required: true, immutable: true },
  availableAt: { type: Date, required: true },
  attempts: { type: Number, default: 0, min: 0 },
  leaseId: { type: String, default: null, select: false },
  lastErrorAt: { type: Date, default: null },
  exhaustedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ assetId: 1 }, { unique: true });
schema.index({ exhaustedAt: 1, availableAt: 1 });
export const MediaCleanupJob = mongoose.model('MediaCleanupJob', schema);
