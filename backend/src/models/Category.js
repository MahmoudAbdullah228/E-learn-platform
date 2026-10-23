import mongoose from 'mongoose';

import { createSlug } from '../utils/slug.js';
import { containsUnsafeCharacter } from '../utils/textValidation.js';

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
      validate: {
        validator: value => !containsUnsafeCharacter(value),
        message: 'Category name contains unsupported characters',
      },
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 120,
      validate: {
        validator: value => createSlug(value) === value,
        message: 'Category slug must be normalized',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
    reviewRevision: { type: Number, default: 0, select: false },
  },
  { timestamps: true },
);

categorySchema.index({ slug: 1 }, { unique: true });

export const Category = mongoose.model('Category', categorySchema);
