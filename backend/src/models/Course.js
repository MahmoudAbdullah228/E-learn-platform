import mongoose from 'mongoose';

import { normalizeSearchText } from '../utils/searchText.js';
import { containsUnsafeCharacter } from '../utils/textValidation.js';

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
    shortDescription: {
      type: String,
      trim: true,
      default: '',
      validate: {
        validator: value => value === '' || (value.length >= 10 && value.length <= 300
          && !containsUnsafeCharacter(value)),
        message: 'Short description must be empty or contain 10 to 300 safe characters',
      },
    },
    level: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced', 'all_levels', null],
      default: null,
    },
    language: { type: String, enum: ['ar', 'en', null], default: null },
    titleSearch: { type: String, default: '', select: false, maxlength: 700 },
    coverKey: { type: String, default: null, select: false },
    coverAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset', default: null },
    // Every curriculum mutation writes this document to serialize concurrent transactions.
    curriculumRevision: { type: Number, default: 0, select: false },
    checkoutRevision: { type: Number, default: 0, select: false },
    learningRevision: { type: Number, default: 0, select: false },
    submittedContentRevision: {
      type: Number, default: null, select: false, min: 0, validate: {
        validator: value => value == null || Number.isSafeInteger(value),
        message: 'Submitted revision must be a safe integer',
      },
    },
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
      enum: ['draft', 'pending_review', 'published', 'rejected', 'unavailable'],
      default: 'draft',
      required: true,
    },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    unavailableAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectionReason: {
      type: String, default: null, maxlength: 500,
      validate: {
        validator: value => value == null || (value.length >= 5
          && !containsUnsafeCharacter(value, true)),
        message: 'Rejection reason must contain 5 to 500 safe characters',
      },
    },
  },
  { timestamps: true },
);

courseSchema.index({ slug: 1 }, { unique: true });
courseSchema.index({ instructorId: 1, status: 1, updatedAt: -1, _id: -1 });
courseSchema.index({ categoryId: 1, status: 1 });
courseSchema.index({ status: 1, titleSearch: 1, _id: 1 });
courseSchema.index({ status: 1, submittedAt: 1, _id: 1 });
courseSchema.index({ status: 1, publishedAt: -1, _id: -1 });

courseSchema.pre('validate', function setTitleSearch() {
  this.titleSearch = normalizeSearchText(this.title);
});

courseSchema.pre(['updateOne', 'findOneAndUpdate'], function setUpdatedTitleSearch() {
  const update = this.getUpdate();
  const title = update?.$set?.title ?? update?.title;
  if (title !== undefined) this.set({ titleSearch: normalizeSearchText(title) });
});

export const Course = mongoose.model('Course', courseSchema);
