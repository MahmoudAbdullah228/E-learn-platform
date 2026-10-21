import mongoose from 'mongoose';

import { Course } from '../../models/Course.js';
import { Enrollment } from '../../models/Enrollment.js';
import { Lesson } from '../../models/Lesson.js';
import { LessonProgress } from '../../models/LessonProgress.js';
import { RefreshSession } from '../../models/RefreshSession.js';
import { Section } from '../../models/Section.js';
import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { toEnrollment } from '../enrollments/enrollment.presenter.js';
import { toLessonProgress } from './progress.presenter.js';
import { readProgressSummaries } from './progress.read.service.js';

const missingEnrollment = () => new ApiError(404, 'ENROLLMENT_NOT_FOUND', 'Enrollment was not found');
const missingLesson = () => new ApiError(404, 'LEARNING_CONTENT_NOT_FOUND', 'Learning content was not found');

export function createProgressService({ clock = () => new Date() } = {}) {
  async function mutate({ auth, courseId, lessonId, completed, setLastLesson = false }) {
    return mongoose.connection.transaction(async session => {
      // Fence current identity, session, entitlement and publication against concurrent changes.
      const user = await User.findOneAndUpdate({ _id: auth.userId, tokenVersion: auth.tokenVersion,
        status: 'active', emailVerifiedAt: { $ne: null }, roles: 'student' },
      { $inc: { learningRevision: 1 } }, { session, timestamps: false }).select('_id');
      if (!user) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required');
      const device = await RefreshSession.findOneAndUpdate({ userId: auth.userId,
        familyId: auth.familyId, tokenVersion: auth.tokenVersion, revokedAt: null,
        expiresAt: { $gt: clock() } }, { $inc: { learningRevision: 1 } },
      { session, timestamps: false }).select('_id');
      if (!device) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required');
      const enrollment = await Enrollment.findOneAndUpdate({ studentId: auth.userId,
        courseId, status: 'active' }, { $inc: { progressRevision: 1 } },
      { session, returnDocument: 'after', timestamps: false });
      if (!enrollment) throw missingEnrollment();
      const course = await Course.findOneAndUpdate({ _id: courseId, status: 'published' },
        { $inc: { learningRevision: 1 } }, { session, timestamps: false }).select('_id');
      if (!course) throw new ApiError(409, 'COURSE_UNAVAILABLE', 'The enrolled course is currently unavailable');
      const lesson = await Lesson.findById(lessonId).select('_id sectionId').session(session).lean();
      const section = lesson && await Section.exists({ _id: lesson.sectionId, courseId }).session(session);
      if (!section) throw missingLesson();
      if (enrollment.lastLessonId && String(enrollment.lastLessonId) !== String(lesson._id)) {
        const previousLesson = await Lesson.findById(enrollment.lastLessonId).select('sectionId').session(session).lean();
        const validPrevious = previousLesson && await Section.exists({
          _id: previousLesson.sectionId, courseId,
        }).session(session);
        if (!validPrevious) enrollment.lastLessonId = null;
      }
      let record;
      if (setLastLesson) {
        enrollment.lastLessonId = lesson._id;
      } else {
        record = await LessonProgress.findOne({ enrollmentId: enrollment._id, lessonId: lesson._id })
          .session(session);
        const completedAt = completed ? record?.completedAt ?? clock() : null;
        record = await LessonProgress.findOneAndUpdate({ enrollmentId: enrollment._id, lessonId: lesson._id },
          { $set: { completedAt } }, { upsert: true, returnDocument: 'after', runValidators: true, session });
      }
      const summaries = await readProgressSummaries({ enrollments: [enrollment], session });
      const progress = summaries.get(enrollment.id);
      enrollment.completedAt = progress.completedAt;
      await enrollment.save({ session });
      return { ...(record ? { lessonProgress: toLessonProgress(record) } : {}),
        enrollment: toEnrollment(enrollment), progress };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  }
  return Object.freeze({
    setCompletion: input => mutate(input),
    setLastLesson: input => mutate({ ...input, setLastLesson: true }),
  });
}
