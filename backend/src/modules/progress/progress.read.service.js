import { Lesson } from '../../models/Lesson.js';
import { LessonProgress } from '../../models/LessonProgress.js';
import { Section } from '../../models/Section.js';
import { toProgressSummary } from './progress.presenter.js';

// All queries belong to the caller's snapshot; orphan/foreign progress never contributes.
export async function readProgressSummaries({ enrollments, session }) {
  if (enrollments.length === 0) return new Map();
  const totals = await Section.aggregate([
    { $match: { courseId: { $in: enrollments.map(e => e.courseId) } } },
    { $lookup: { from: Lesson.collection.name, localField: '_id', foreignField: 'sectionId',
      pipeline: [{ $count: 'count' }], as: 'counts' } },
    { $group: { _id: '$courseId', totalLessons: {
      $sum: { $ifNull: [{ $arrayElemAt: ['$counts.count', 0] }, 0] },
    } } },
  ]).session(session);
  const completions = await LessonProgress.aggregate([
    { $match: { enrollmentId: { $in: enrollments.map(e => e._id) }, completedAt: { $ne: null } } },
    { $lookup: { from: Lesson.collection.name, localField: 'lessonId', foreignField: '_id', as: 'lesson' } },
    { $unwind: '$lesson' },
    { $lookup: { from: Section.collection.name, localField: 'lesson.sectionId', foreignField: '_id', as: 'section' } },
    { $unwind: '$section' },
    { $group: { _id: { enrollmentId: '$enrollmentId', courseId: '$section.courseId' },
      completedLessons: { $sum: 1 }, completedAt: { $max: '$completedAt' } } },
  ]).session(session);
  const totalByCourse = new Map(totals.map(row => [String(row._id), row.totalLessons]));
  const completedByCourseEnrollment = new Map(completions.map(row =>
    [`${row._id.enrollmentId}:${row._id.courseId}`, row]));
  return new Map(enrollments.map(enrollment => {
    const completed = completedByCourseEnrollment.get(`${enrollment._id}:${enrollment.courseId}`);
    return [String(enrollment._id), toProgressSummary({
      totalLessons: totalByCourse.get(String(enrollment.courseId)) ?? 0,
      completedLessons: completed?.completedLessons ?? 0, completedAt: completed?.completedAt ?? null,
    })];
  }));
}
