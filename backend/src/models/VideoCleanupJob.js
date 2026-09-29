import mongoose from 'mongoose';

const videoCleanupJobSchema = new mongoose.Schema({
  resourceType: { type: String, enum: ['upload', 'asset'], required: true, immutable: true },
  resourceId: { type: String, required: true, immutable: true, maxlength: 255 },
  attempts: { type: Number, required: true, default: 0, min: 0 },
  availableAt: { type: Date, required: true, default: Date.now },
  leaseId: { type: String, default: null, select: false, maxlength: 64 },
  lastErrorAt: { type: Date, default: null },
  exhaustedAt: { type: Date, default: null },
}, { timestamps: true });

videoCleanupJobSchema.index({ resourceType: 1, resourceId: 1 }, { unique: true });
videoCleanupJobSchema.index({ exhaustedAt: 1, availableAt: 1, attempts: 1 });

export const VideoCleanupJob = mongoose.model('VideoCleanupJob', videoCleanupJobSchema);
