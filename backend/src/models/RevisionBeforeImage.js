import mongoose from 'mongoose';

// Retain server-side before-images for changed or removed published content.
const schema = new mongoose.Schema({
  revisionId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  kind: { type: String, enum: ['course', 'section', 'lesson'], required: true, immutable: true },
  logicalId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  before: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true, select: false },
}, { timestamps: true });
schema.index({ revisionId: 1, kind: 1, logicalId: 1 }, { unique: true });
for (const field of ['coverAssetId', 'attachments', 'videoAssetId', 'videoUploadId']) {
  schema.index({ ['before.' + field]: 1 }, { sparse: true });
}
export const RevisionBeforeImage = mongoose.model('RevisionBeforeImage', schema);
