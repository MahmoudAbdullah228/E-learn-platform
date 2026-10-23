import { Category } from '../../models/Category.js';
import { Lesson } from '../../models/Lesson.js';
import { MediaAsset } from '../../models/MediaAsset.js';
import { Section } from '../../models/Section.js';
import { VideoAssetState } from '../../models/VideoAssetState.js';
import { ApiError } from '../../utils/ApiError.js';

function notReady(field, message) {
  throw new ApiError(409, 'COURSE_NOT_READY', 'Course is not ready for review or publication',
    [{ field, message }]);
}

export async function assertCourseReady(course, session) {
  if (!course.title || !course.description || !course.shortDescription
      || !course.level || !course.language || !Number.isSafeInteger(course.priceMinor)
      || course.priceMinor < 0 || course.currency !== 'EGP') {
    notReady('course', 'Complete the required course information');
  }
  const category = await Category.findOneAndUpdate({ _id: course.categoryId, isActive: true },
    { $inc: { reviewRevision: 1 } }, { session, timestamps: false });
  if (!category) notReady('categoryId', 'Choose an active category');
  if (!course.coverAssetId) notReady('coverAssetId', 'Upload a course cover');
  const cover = await MediaAsset.exists({ _id: course.coverAssetId, ownerId: course.instructorId,
    targetId: course._id, purpose: 'course_cover', status: 'ready' }).session(session);
  if (!cover) notReady('coverAssetId', 'Confirm a valid course cover');

  const sections = await Section.find({ courseId: course._id }).select('_id').session(session).lean();
  if (sections.length === 0) notReady('sections', 'Add at least one section');
  const sectionIds = sections.map(section => section._id);
  const lessonCounts = await Lesson.aggregate([
    { $match: { sectionId: { $in: sectionIds } } },
    { $group: { _id: '$sectionId', count: { $sum: 1 } } },
  ]).session(session);
  if (lessonCounts.length !== sections.length) {
    notReady('sections', 'Every section must contain at least one lesson');
  }
  const invalidLesson = await Lesson.exists({ sectionId: { $in: sectionIds },
    $or: [{ videoStatus: { $ne: 'ready' } }, { videoAssetId: { $in: [null, ''] } }] })
    .session(session);
  if (invalidLesson) notReady('lessons', 'Every lesson video must be ready');
  const assetIds = await Lesson.distinct('videoAssetId', { sectionId: { $in: sectionIds } })
    .session(session);
  const deletedAsset = await VideoAssetState.exists({ _id: { $in: assetIds },
    deletedAt: { $ne: null } }).session(session);
  if (deletedAsset) notReady('lessons', 'A lesson video is no longer available');
}
