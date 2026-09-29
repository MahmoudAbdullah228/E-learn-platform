import mongoose from 'mongoose';

const sectionSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, immutable: true,
  },
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 160 },
  position: {
    type: Number, required: true, min: 0, max: Number.MAX_SAFE_INTEGER,
    validate: Number.isSafeInteger,
  },
}, { timestamps: true });

// Intentionally non-unique: reorder may temporarily overlap positions inside its transaction.
sectionSchema.index({ courseId: 1, position: 1 });

export const Section = mongoose.model('Section', sectionSchema);
