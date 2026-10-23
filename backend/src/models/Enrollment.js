import mongoose from 'mongoose';
import { protectSnapshot } from './protectSnapshot.js';

const schema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, immutable: true },
  sourceOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  status: { type: String, enum: ['active', 'revoked'], required: true, default: 'active' },
  lastLessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', default: null },
  enrolledAt: { type: Date, required: true },
  completedAt: { type: Date, default: null },
  progressRevision: { type: Number, default: 0, select: false },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });
protectSnapshot(schema, ['studentId', 'courseId']);
schema.index({ studentId: 1, courseId: 1 }, { unique: true });
schema.index({ studentId: 1, status: 1, enrolledAt: -1, _id: -1 });
schema.index({ studentId: 1, enrolledAt: -1, _id: -1 });
export const Enrollment = mongoose.model('Enrollment', schema);
