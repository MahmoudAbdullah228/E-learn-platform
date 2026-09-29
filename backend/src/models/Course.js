import mongoose from 'mongoose';

const listValidators = [
  {
    validator: values => values.length <= 30,
    message: 'List cannot contain more than 30 items',
  },
  {
    validator: values => new Set(values.map(value => value.toLocaleLowerCase())).size
      === values.length,
    message: 'List items must be unique',
  },
];

const courseSchema = new mongoose.Schema(
  {
    instructorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 160 },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 1,
      maxlength: 220,
      immutable: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 20,
      maxlength: 10000,
    },
    coverKey: { type: String, default: null, select: false },
    // Every curriculum mutation writes this document to serialize concurrent transactions.
    curriculumRevision: { type: Number, default: 0, select: false },
    requirements: {
      type: [{ type: String, trim: true, minlength: 2, maxlength: 300 }],
      default: [],
      validate: listValidators,
    },
    learningOutcomes: {
      type: [{ type: String, trim: true, minlength: 2, maxlength: 300 }],
      default: [],
      validate: listValidators,
    },
    priceMinor: {
      type: Number,
      required: true,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      validate: Number.isSafeInteger,
    },
    currency: { type: String, enum: ['EGP'], default: 'EGP', required: true },
    status: {
      type: String,
      enum: ['draft', 'pending_review', 'published', 'rejected'],
      default: 'draft',
      required: true,
    },
  },
  { timestamps: true },
);

courseSchema.index({ slug: 1 }, { unique: true });
courseSchema.index({ instructorId: 1, status: 1, updatedAt: -1, _id: -1 });
courseSchema.index({ categoryId: 1, status: 1 });

export const Course = mongoose.model('Course', courseSchema);
