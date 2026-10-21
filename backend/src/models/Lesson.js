import mongoose from 'mongoose';

import { containsUnsafeCharacter } from '../utils/textValidation.js';

const lessonSchema = new mongoose.Schema({
  sectionId: {
    type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true, immutable: true,
  },
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 160 },
  description: {
    type: String,
    trim: true,
    default: '',
    maxlength: 10000,
    validate: {
      validator: value => !containsUnsafeCharacter(value, true),
      message: 'Description contains unsupported control or formatting characters',
    },
  },
  position: {
    type: Number, required: true, min: 0, max: Number.MAX_SAFE_INTEGER,
    validate: Number.isSafeInteger,
  },
  videoAssetId: { type: String, default: null, select: false, maxlength: 255 },
  videoUploadId: { type: String, default: null, select: false, maxlength: 255 },
  videoUploadAttemptId: { type: String, default: null, select: false, maxlength: 64 },
  videoUploadExpiresAt: { type: Date, default: null, select: false },
  videoStatus: {
    type: String, enum: ['none', 'pending', 'processing', 'ready', 'failed'],
    default: 'none', required: true,
  },
  durationSeconds: {
    type: Number, default: 0, min: 0, max: Number.MAX_SAFE_INTEGER,
    validate: Number.isSafeInteger,
  },
  isPreview: { type: Boolean, default: false, required: true },
  attachments: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset' }],
    default: [],
    validate: {
      validator: value => value.length <= 1,
      message: 'A lesson can have at most one attachment',
    },
  },
}, { timestamps: true });

lessonSchema.index({ sectionId: 1, position: 1 });
lessonSchema.index(
  { videoUploadAttemptId: 1 },
  { unique: true, partialFilterExpression: { videoUploadAttemptId: { $type: 'string' } } },
);
lessonSchema.index(
  { videoUploadId: 1 },
  { unique: true, partialFilterExpression: { videoUploadId: { $type: 'string' } } },
);

export const Lesson = mongoose.model('Lesson', lessonSchema);
