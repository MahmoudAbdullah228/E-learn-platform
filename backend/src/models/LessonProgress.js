import mongoose from 'mongoose';

import { protectSnapshot } from './protectSnapshot.js';

const schema = new mongoose.Schema({
  enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', required: true, immutable: true },
  lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true, immutable: true },
  completedAt: { type: Date, default: null },
}, { timestamps: true });
protectSnapshot(schema, ['enrollmentId', 'lessonId']);
schema.index({ enrollmentId: 1, lessonId: 1 }, { unique: true });
schema.index({ enrollmentId: 1, completedAt: 1 });

export const LessonProgress = mongoose.model('LessonProgress', schema);
