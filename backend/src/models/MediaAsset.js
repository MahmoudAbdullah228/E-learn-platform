import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  purpose: { type: String, enum: ['avatar', 'course_cover', 'lesson_attachment'], required: true, immutable: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  provider: { type: String, enum: ['cloudinary'], default: 'cloudinary', immutable: true },
  publicId: { type: String, required: true, immutable: true },
  providerAssetId: { type: String, default: null },
  resourceType: { type: String, enum: ['image', 'raw'], required: true, immutable: true },
  deliveryType: { type: String, enum: ['upload', 'authenticated'], required: true, immutable: true },
  status: { type: String, enum: ['pending', 'ready', 'rejected', 'deleting', 'deleted'], default: 'pending' },
  bytes: { type: Number, default: null, min: 0 },
  format: { type: String, default: null },
  originalName: { type: String, default: null, maxlength: 255 },
  expiresAt: { type: Date, required: true },
  providerUploadValidUntil: { type: Date, required: true },
  attachedAt: { type: Date, default: null },
  cleanupNotBefore: { type: Date, default: null, select: false },
}, { timestamps: true });

schema.index({ publicId: 1 }, { unique: true });
schema.index({ providerAssetId: 1 }, {
  unique: true, partialFilterExpression: { providerAssetId: { $type: 'string' } },
});
schema.index({ status: 1, expiresAt: 1 });
schema.index({ ownerId: 1, status: 1 });
schema.index({ targetId: 1, purpose: 1, status: 1 });

export const MediaAsset = mongoose.model('MediaAsset', schema);
