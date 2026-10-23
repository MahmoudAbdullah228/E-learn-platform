import mongoose from 'mongoose';

import { Course } from '../../models/Course.js';
import { Enrollment } from '../../models/Enrollment.js';
import { Lesson } from '../../models/Lesson.js';
import { MediaAsset } from '../../models/MediaAsset.js';
import { RefreshSession } from '../../models/RefreshSession.js';
import { Section } from '../../models/Section.js';
import { User } from '../../models/User.js';
import { VideoAssetState } from '../../models/VideoAssetState.js';
import { ApiError } from '../../utils/ApiError.js';

const notFound = () => new ApiError(404, 'LEARNING_CONTENT_NOT_FOUND', 'Learning content was not found');

// A fresh snapshot is also taken after provider work: old JWT roles/enrollments are not authority.
export async function resolveLearningAccess({ lessonId, auth, assetId, kind, signal, clock = () => new Date() }) {
  signal?.throwIfAborted();
  return mongoose.connection.transaction(async session => {
    const read = async query => {
      signal?.throwIfAborted();
      const value = await query.session(session).maxTimeMS(10_000);
      signal?.throwIfAborted();
      return value;
    };
    let user;
    if (auth) {
      user = await read(User.findOne({ _id: auth.userId, status: 'active',
        emailVerifiedAt: { $ne: null }, tokenVersion: auth.tokenVersion })
        .select('roles instructorStatus').lean());
      const liveSession = user && await read(RefreshSession.exists({ familyId: auth.familyId,
        userId: auth.userId, tokenVersion: auth.tokenVersion, revokedAt: null,
        expiresAt: { $gt: clock() } }));
      if (!liveSession) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required');
    }
    const lesson = await read(Lesson.findById(lessonId).select('+videoAssetId').lean());
    const section = lesson && await read(Section.findById(lesson.sectionId).lean());
    const course = section && await read(Course.findById(section.courseId).lean());
    if (!course) throw notFound();
    const privileged = user && (user.roles.includes('admin')
      || (String(course.instructorId) === String(auth.userId)
        && user.roles.includes('instructor') && user.instructorStatus === 'approved'));
    if (!privileged) {
      if (course.status !== 'published') throw notFound();
      const preview = kind === 'playback' && lesson.isPreview;
      const enrollment = user?.roles.includes('student') && await read(Enrollment.exists({
        studentId: auth.userId, courseId: course._id, status: 'active',
      }));
      if (!preview && !enrollment) {
        throw new ApiError(403, 'ENROLLMENT_REQUIRED', 'An active course enrollment is required');
      }
    }
    if (kind === 'playback') {
      const deleted = lesson.videoAssetId && await read(VideoAssetState.exists({
        _id: lesson.videoAssetId, deletedAt: { $ne: null },
      }));
      if (lesson.videoStatus !== 'ready' || !lesson.videoAssetId || deleted) {
        throw new ApiError(409, 'VIDEO_NOT_READY', 'The lesson video is unavailable or not ready');
      }
      return { lesson, course };
    }
    if (!lesson.attachments.some(id => String(id) === String(assetId))) throw notFound();
    const asset = await read(MediaAsset.findOne({ _id: assetId, targetId: lesson._id,
      ownerId: course.instructorId, purpose: 'lesson_attachment', provider: 'cloudinary',
      resourceType: 'raw', deliveryType: 'authenticated', status: 'ready', format: 'pdf',
    }).lean());
    if (!asset) throw notFound();
    return { lesson, course, asset };
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
}
