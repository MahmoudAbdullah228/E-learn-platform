import mongoose from 'mongoose';

import { Course } from '../../models/Course.js';
import { Enrollment } from '../../models/Enrollment.js';
import { Lesson } from '../../models/Lesson.js';
import { LessonProgress } from '../../models/LessonProgress.js';
import { MediaAsset } from '../../models/MediaAsset.js';
import { Order } from '../../models/Order.js';
import { Section } from '../../models/Section.js';
import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { toPagination } from '../../utils/pagination.js';
import { toEnrollment, toLibraryCourse } from './enrollment.presenter.js';
import { readProgressSummaries } from '../progress/progress.read.service.js';
import { courseCoverUrl } from '../media/courseCoverUrl.js';
import { publicCourseFilter, isLearningCourse, courseAvailabilityCode } from '../courses/courseAccess.policy.js';
import { reactivateFreeEnrollment } from './enrollmentReentry.service.js';

const options = { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } };
const transaction = work => mongoose.connection.transaction(work, options);
const byId = values => new Map(values.map(value => [value._id.toString(), value]));

export function createEnrollmentService({ mediaProvider, clock = () => new Date() }) {
  return Object.freeze({
    async enrollFree({ studentId, courseId }) {
      return transaction(async session => {
        // Share reservation locks with checkout; a price/status/account change cannot
        // turn a pending paid purchase into an unaccounted free entitlement.
        const student = await User.findOneAndUpdate({ _id: studentId, status: 'active',
          roles: 'student', emailVerifiedAt: { $ne: null } },
        { $inc: { checkoutRevision: 1 } }, { session, timestamps: false }).select('_id');
        if (!student) throw new ApiError(403, 'ENROLLMENT_NOT_ALLOWED',
          'A verified active student account is required');
        const course = await Course.findOneAndUpdate(publicCourseFilter({ _id: courseId }),
          { $inc: { checkoutRevision: 1 } }, { session, timestamps: false });
        if (!course) throw new ApiError(404, 'COURSE_NOT_FOUND', 'Course was not found');
        if (course.instructorId.toString() === studentId.toString()) {
          throw new ApiError(403, 'OWN_COURSE_ENROLLMENT_NOT_ALLOWED',
            'You cannot enroll in your own course');
        }
        const existing = await Enrollment.findOne({ studentId, courseId }).select('+progressRevision').session(session);
        if (existing?.status === 'active') {
          const summaries = await readProgressSummaries({ enrollments: [existing], session });
          return { created: false, enrollment: toEnrollment(existing,
            { completedAt: summaries.get(existing.id).completedAt }) };
        }
        if (await Order.exists({ studentId, courseId, purchaseSlotActive: true }).session(session)) {
          throw new ApiError(409, 'PAYMENT_PENDING', 'An existing purchase must be resolved first');
        }
        if (course.priceMinor !== 0) throw new ApiError(409, 'PAID_COURSE_REQUIRES_CHECKOUT',
          'Paid courses require payment checkout');
        if (existing) {
          const enrollment = await reactivateFreeEnrollment({ enrollment: existing, session, now: clock() });
          return { created: false, enrollment: toEnrollment(enrollment) };
        }
        const [enrollment] = await Enrollment.create([{ studentId, courseId, enrolledAt: clock(),
          sourceOrderId: null }], { session });
        return { created: true, enrollment: toEnrollment(enrollment) };
      });
    },

    async listLibrary({ studentId, ...query }) {
      return transaction(async session => {
        const filter = { studentId, ...(query.status === 'all' ? {} : { status: query.status }) };
        const enrollments = await Enrollment.find(filter).sort({ enrolledAt: -1, _id: -1 })
          .skip((query.page - 1) * query.limit).limit(query.limit).session(session).lean();
        const total = await Enrollment.countDocuments(filter).session(session);
        const courses = await Course.find({ _id: { $in: enrollments.map(e => e.courseId) },
          status: { $in: ['published', 'archived'] } })
          .select('_id status accessStatus unavailableAt archivedAt slug title shortDescription level language coverAssetId instructorId')
          .session(session).lean();
        const covers = await MediaAsset.find({ _id: { $in: courses.map(c => c.coverAssetId).filter(Boolean) },
          status: 'ready', purpose: 'course_cover', resourceType: 'image', deliveryType: 'upload' })
          .select('_id targetId ownerId publicId format').session(session).lean();
        const courseMap = byId(courses); const coverMap = byId(covers);
        const summaries = await readProgressSummaries({ enrollments: enrollments.filter(e =>
          e.status === 'active' && isLearningCourse(courseMap.get(String(e.courseId)))), session });
        const lastLessons = await Lesson.find({ _id: { $in: enrollments.map(e => e.lastLessonId).filter(Boolean) } })
          .select('_id sectionId').session(session).lean();
        const lastSections = await Section.find({ _id: { $in: lastLessons.map(l => l.sectionId) },
          courseId: { $in: courses.map(c => c._id) } }).select('_id courseId').session(session).lean();
        const lastSectionMap = byId(lastSections); const lastLessonMap = byId(lastLessons);
        return { courses: enrollments.map(enrollment => {
          const course = courseMap.get(enrollment.courseId.toString());
          const cover = coverMap.get(course?.coverAssetId?.toString());
          const coverUrl = courseCoverUrl(course, cover, mediaProvider);
          const lastLesson = lastLessonMap.get(enrollment.lastLessonId?.toString());
          const lastSection = lastLesson && lastSectionMap.get(lastLesson.sectionId.toString());
          const lastLessonId = lastSection?.courseId.toString() === enrollment.courseId.toString()
            ? enrollment.lastLessonId : null;
          const progress = summaries.get(String(enrollment._id)) ?? null;
          return { enrollment: toEnrollment(enrollment, { lastLessonId, completedAt: progress?.completedAt ?? null }),
            course: toLibraryCourse(course, coverUrl), progress,
            available: enrollment.status === 'active' && isLearningCourse(course),
            availabilityCode: enrollment.status === 'revoked' && enrollment.revocationReason === 'refund'
              ? 'ENROLLMENT_REFUNDED' : courseAvailabilityCode(course, enrollment.status) };
        }), pagination: toPagination(query, total) };
      });
    },

    async getLearningCourse({ studentId, courseId }) {
      return transaction(async session => {
        const enrollment = await Enrollment.findOne({ studentId, courseId, status: 'active' })
          .session(session).lean();
        if (!enrollment) throw new ApiError(404, 'ENROLLMENT_NOT_FOUND', 'Enrollment was not found');
        const course = await Course.findById(courseId)
          .select('_id status accessStatus unavailableAt archivedAt slug title shortDescription level language description requirements learningOutcomes instructorId')
          .session(session).lean();
        if (!isLearningCourse(course)) throw new ApiError(409, courseAvailabilityCode(course),
          'The enrolled course is currently unavailable');
        const sections = await Section.find({ courseId }).select('_id title position')
          .sort({ position: 1, _id: 1 }).session(session).lean();
        const lessons = await Lesson.find({ sectionId: { $in: sections.map(s => s._id) } })
          .select('_id sectionId title description position durationSeconds videoStatus isPreview attachments')
          .sort({ position: 1, _id: 1 }).session(session).lean();
        const attachments = await MediaAsset.find({
          _id: { $in: lessons.flatMap(l => l.attachments) }, ownerId: course.instructorId,
          targetId: { $in: lessons.map(l => l._id) }, purpose: 'lesson_attachment',
          status: 'ready', provider: 'cloudinary', resourceType: 'raw',
          deliveryType: 'authenticated', format: 'pdf',
        }).select('_id targetId').session(session).lean();
        const attachmentMap = byId(attachments);
        const records = await LessonProgress.find({ enrollmentId: enrollment._id,
          lessonId: { $in: lessons.map(l => l._id) } }).select('lessonId completedAt').session(session).lean();
        const completionMap = new Map(records.map(record => [String(record.lessonId), record.completedAt]));
        const summaries = await readProgressSummaries({ enrollments: [enrollment], session });
        const progress = summaries.get(String(enrollment._id));
        const grouped = new Map(sections.map(s => [s._id.toString(), []]));
        for (const lesson of lessons) grouped.get(lesson.sectionId.toString()).push({
          id: lesson._id.toString(), title: lesson.title, description: lesson.description ?? '',
          position: lesson.position, durationSeconds: lesson.durationSeconds,
          videoStatus: lesson.videoStatus, isPreview: lesson.isPreview,
          completed: completionMap.get(String(lesson._id)) != null,
          completedAt: completionMap.get(String(lesson._id)) ?? null,
          attachments: lesson.attachments.filter(id =>
            attachmentMap.get(String(id))?.targetId.toString() === lesson._id.toString()).map(String),
        });
        const lastLessonId = lessons.some(l => l._id.toString() === enrollment.lastLessonId?.toString())
          ? enrollment.lastLessonId : null;
        return { enrollment: toEnrollment(enrollment, { lastLessonId, completedAt: progress.completedAt }), progress, course: {
          ...toLibraryCourse(course), description: course.description,
          requirements: course.requirements, learningOutcomes: course.learningOutcomes,
          sections: sections.map(s => ({ id: s._id.toString(), title: s.title, position: s.position,
            lessons: grouped.get(s._id.toString()) })),
        } };
      });
    },
  });
}
