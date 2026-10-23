import mongoose from 'mongoose';

import { Category } from '../../models/Category.js';
import { Course } from '../../models/Course.js';
import { CourseReviewEvent } from '../../models/CourseReviewEvent.js';
import { Lesson } from '../../models/Lesson.js';
import { Section } from '../../models/Section.js';
import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { toCourse } from '../courses/course.presenter.js';
import { assertCourseReady } from './courseReadiness.service.js';

const transactionOptions = { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } };

function notFound() {
  return new ApiError(404, 'COURSE_NOT_FOUND', 'Course was not found');
}

function invalidState() {
  return new ApiError(409, 'INVALID_COURSE_STATE', 'Course state does not allow this action');
}

async function requireApprovedInstructor(instructorId, session) {
  // A write makes concurrent account suspension/revocation conflict with publication.
  const approved = await User.findOneAndUpdate({ _id: instructorId, status: 'active',
    instructorStatus: 'approved', roles: 'instructor' },
    { $inc: { instructorReviewRevision: 1 } }, { session, timestamps: false }).select('_id');
  if (!approved) throw new ApiError(403, 'INSTRUCTOR_NOT_APPROVED',
    'An approved instructor account is required');
}

async function transitionCourse({ courseId, filter, fromStatus, session }) {
  const course = await Course.findOneAndUpdate({ _id: courseId, ...filter, status: fromStatus },
    { $inc: { curriculumRevision: 1 } }, { session, returnDocument: 'after' })
    .select('+curriculumRevision +submittedContentRevision');
  if (course) return course;
  const visible = await Course.exists({ _id: courseId, ...filter }).session(session);
  if (!visible) throw notFound();
  throw invalidState();
}

async function appendEvent({ course, actorId, action, fromStatus, reason, at, session }) {
  await CourseReviewEvent.create([{ courseId: course._id, actorId, action,
    fromStatus, toStatus: course.status, reason: reason ?? null, occurredAt: at }], { session });
}

async function present(course, session) {
  const category = await Category.findById(course.categoryId).session(session).lean();
  return toCourse(course, category);
}

export function createCourseReviewService({ clock = () => new Date() } = {}) {
  const transaction = work => mongoose.connection.transaction(work, transactionOptions);
  return Object.freeze({
    async submit({ courseId, instructorId }) {
      return transaction(async session => {
        await requireApprovedInstructor(instructorId, session);
        const course = await transitionCourse({ courseId, filter: { instructorId },
          fromStatus: 'draft', session });
        await assertCourseReady(course, session);
        const at = clock();
        course.status = 'pending_review';
        course.submittedAt = at;
        course.submittedContentRevision = course.curriculumRevision;
        course.reviewedAt = null;
        course.reviewedBy = null;
        course.rejectionReason = null;
        await course.save({ session });
        await appendEvent({ course, actorId: instructorId, action: 'submitted',
          fromStatus: 'draft', at, session });
        return present(course, session);
      });
    },

    async reopen({ courseId, instructorId }) {
      return transaction(async session => {
        await requireApprovedInstructor(instructorId, session);
        const course = await Course.findOneAndUpdate({ _id: courseId, instructorId,
          status: { $in: ['rejected', 'unavailable'] } },
        { $inc: { curriculumRevision: 1 } }, { session, returnDocument: 'after' })
          .select('+curriculumRevision +submittedContentRevision');
        if (!course) {
          const visible = await Course.exists({ _id: courseId, instructorId }).session(session);
          if (!visible) throw notFound();
          throw invalidState();
        }
        const fromStatus = course.status;
        const at = clock();
        course.status = 'draft';
        course.submittedAt = null;
        course.submittedContentRevision = null;
        course.reviewedAt = null;
        course.reviewedBy = null;
        course.publishedAt = null;
        course.unavailableAt = null;
        course.rejectionReason = null;
        await course.save({ session });
        await appendEvent({ course, actorId: instructorId, action: 'reopened',
          fromStatus, at, session });
        return present(course, session);
      });
    },

    async listForReview({ status, page, limit }) {
      const filter = { status };
      const [courses, total] = await Promise.all([
        Course.find(filter).sort({ submittedAt: 1, _id: 1 })
          .skip((page - 1) * limit).limit(limit).lean(),
        Course.countDocuments(filter),
      ]);
      const categories = await Category.find({ _id: { $in: courses.map(c => c.categoryId) } })
        .lean();
      const byId = new Map(categories.map(category => [category._id.toString(), category]));
      return { courses: courses.map(course => toCourse(course,
        byId.get(course.categoryId.toString()))),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    },

    async getForReview({ courseId }) {
      const course = await Course.findById(courseId).lean();
      if (!course) throw notFound();
      const [category, instructor, sections, events] = await Promise.all([
        Category.findById(course.categoryId).lean(),
        User.findById(course.instructorId).select('_id name email').lean(),
        Section.find({ courseId }).sort({ position: 1, _id: 1 }).lean(),
        CourseReviewEvent.find({ courseId }).sort({ occurredAt: -1, _id: -1 }).lean(),
      ]);
      const lessons = await Lesson.find({ sectionId: { $in: sections.map(s => s._id) } })
        .sort({ position: 1, _id: 1 }).lean();
      const bySection = new Map(sections.map(s => [s._id.toString(), []]));
      for (const lesson of lessons) {
        bySection.get(lesson.sectionId.toString()).push({
          id: lesson._id.toString(), title: lesson.title, description: lesson.description ?? '',
          position: lesson.position, videoStatus: lesson.videoStatus,
          durationSeconds: lesson.durationSeconds, isPreview: lesson.isPreview,
          attachments: lesson.attachments.map(id => id.toString()),
        });
      }
      return {
        course: toCourse(course, category),
        instructor: instructor ? { id: instructor._id.toString(), name: instructor.name,
          email: instructor.email } : null,
        sections: sections.map(section => ({ id: section._id.toString(), title: section.title,
          position: section.position, lessons: bySection.get(section._id.toString()) })),
        reviewEvents: events.map(event => ({ id: event._id.toString(),
          actorId: event.actorId?.toString() ?? null, action: event.action,
          fromStatus: event.fromStatus, toStatus: event.toStatus,
          reason: event.reason, occurredAt: event.occurredAt })),
      };
    },

    async review({ courseId, adminId, decision, reason }) {
      return transaction(async session => {
        const course = await transitionCourse({ courseId, filter: {},
          fromStatus: 'pending_review', session });
        if (decision === 'approve') {
          await requireApprovedInstructor(course.instructorId, session);
          if (course.submittedContentRevision == null
              || course.curriculumRevision !== course.submittedContentRevision + 1) {
            throw new ApiError(409, 'COURSE_CHANGED_DURING_REVIEW',
              'Course content changed after submission; reject and request resubmission');
          }
          await assertCourseReady(course, session);
        }
        const at = clock();
        course.status = decision === 'approve' ? 'published' : 'rejected';
        course.reviewedAt = at;
        course.reviewedBy = adminId;
        course.publishedAt = decision === 'approve' ? at : null;
        course.rejectionReason = decision === 'reject' ? reason : null;
        await course.save({ session });
        await appendEvent({ course, actorId: adminId,
          action: decision === 'approve' ? 'approved' : 'rejected',
          fromStatus: 'pending_review', reason, at, session });
        return present(course, session);
      });
    },
  });
}
