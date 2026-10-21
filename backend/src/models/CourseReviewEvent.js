import mongoose from 'mongoose';

import { containsUnsafeCharacter } from '../utils/textValidation.js';

const schema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, immutable: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, immutable: true,
    validate: {
      validator(value) { return this.action === 'unpublished' ? value == null : value != null; },
      message: 'Only system unpublication events may omit the actor',
    } },
  action: { type: String, enum: ['submitted', 'approved', 'rejected', 'reopened', 'unpublished'], required: true,
    immutable: true },
  fromStatus: { type: String, enum: ['draft', 'pending_review', 'published', 'rejected', 'unavailable'], required: true,
    immutable: true },
  toStatus: { type: String, enum: ['draft', 'pending_review', 'published', 'rejected', 'unavailable'], required: true,
    immutable: true },
  reason: {
    type: String, default: null, maxlength: 500, immutable: true,
    validate: {
      validator: value => value == null || (value.length >= 5
        && !containsUnsafeCharacter(value, true)),
      message: 'Review reason must contain 5 to 500 safe characters',
    },
  },
  occurredAt: { type: Date, required: true, immutable: true },
}, { versionKey: false });

schema.index({ courseId: 1, occurredAt: -1, _id: -1 });
schema.index({ actorId: 1, occurredAt: -1 });

export const CourseReviewEvent = mongoose.model('CourseReviewEvent', schema);
