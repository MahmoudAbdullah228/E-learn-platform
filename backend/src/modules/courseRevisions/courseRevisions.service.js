import mongoose from 'mongoose';

import { cleanupCandidateMedia, cleanupCandidateVideos } from './revisionMediaCleanup.service.js';
import { Course } from '../../models/Course.js';
import { CourseRevision, metadataKeys, RevisionLesson, RevisionSection } from '../../models/CourseRevision.js';
import { Lesson } from '../../models/Lesson.js';
import { Section } from '../../models/Section.js';
import { RefreshSession } from '../../models/RefreshSession.js';
import { User } from '../../models/User.js';
import { requireActiveCategory } from '../courses/courses.service.js';
import { appendAuditEvent } from '../audit/audit.service.js';
import { ApiError } from '../../utils/ApiError.js';

const missing = () => new ApiError(404, 'REVISION_NOT_FOUND', 'Course revision content was not found');
const conflict = () => new ApiError(409, 'STATE_CONFLICT', 'Reload the current revision');
const transaction = fn => mongoose.connection.transaction(fn, { readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' } });

async function ownedCourse({ auth, courseId }, session, writing) {
  const filter = { _id: auth.userId, roles: 'instructor', instructorStatus: 'approved',
    status: 'active', tokenVersion: auth.tokenVersion, emailVerifiedAt: { $ne: null } };
  const instructor = writing
    ? await User.findOneAndUpdate(filter, { $inc: { instructorReviewRevision: 1 } },
      { session, timestamps: false }).select('_id')
    : await User.exists(filter).session(session);
  if (!instructor) throw new ApiError(403, 'INSTRUCTOR_NOT_APPROVED', 'An approved instructor is required');
  const device = { userId: auth.userId, familyId: auth.familyId, revokedAt: null,
    tokenVersion: auth.tokenVersion, expiresAt: { $gt: new Date() } };
  const currentSession = writing
    ? await RefreshSession.findOneAndUpdate(device, { $inc: { learningRevision: 1 } }, { session, timestamps: false }).select('_id')
    : await RefreshSession.exists(device).session(session);
  if (!currentSession) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required');
  const owner = { _id: courseId, instructorId: auth.userId };
  const query = writing ? Course.findOneAndUpdate(owner, { $inc: { candidateWriteRevision: 1 } }, { timestamps: false })
    : Course.findOne(owner);
  const course = await query.select('+curriculumRevision').session(session).lean();
  if (!course) throw missing();
  if (writing && course.status !== 'published') {
    throw new ApiError(409, 'INVALID_COURSE_STATE', 'Only published courses accept candidate revisions');
  }
  return course;
}

export function present(row) {
  return { id: String(row._id), courseId: String(row.courseId), number: row.number, status: row.status,
    revision: row.revision, baseContentRevision: row.baseContentRevision, metadata: row.metadata, rejectionReason: row.rejectionReason ?? null };
}

export async function createCandidate(context) {
  return transaction(async session => {
    const course = await ownedCourse(context, session, true);
    const filter = { courseId: course._id };
    if (await CourseRevision.exists({ ...filter, active: true }).session(session)) throw conflict();
    const previous = await CourseRevision.findOne(filter).sort({ number: -1 }).select('number').session(session);
    const [row] = await CourseRevision.create([{ ...filter, number: (previous?.number ?? 0) + 1,
      baseContentRevision: course.curriculumRevision ?? 0,
      metadata: Object.fromEntries(metadataKeys.map(key => [key, course[key]])) }], { session });
    const sections = Section.find(filter).sort({ position: 1, _id: 1 }).session(session).lean().cursor();
    let position = 0;
    for await (const section of sections) {
      await RevisionSection.create([{ revisionId: row._id, logicalId: section._id,
        title: section.title, position: position++ }], { session });
      const lessons = Lesson.find({ sectionId: section._id }).select('+videoAssetId')
        .sort({ position: 1, _id: 1 }).session(session).lean().cursor();
      let lessonPosition = 0;
      let batch = [];
      for await (const item of lessons) {
        batch.push({ revisionId: row._id, logicalId: item._id, sectionId: section._id,
          title: item.title, description: item.description, isPreview: item.isPreview,
          videoStatus: item.videoStatus, videoAssetId: item.videoAssetId, attachments: item.attachments,
          durationSeconds: item.durationSeconds, position: lessonPosition++ });
        if (batch.length === 100) {
          await RevisionLesson.insertMany(batch, { session, ordered: true });
          batch = [];
        }
      }
      if (batch.length) await RevisionLesson.insertMany(batch, { session, ordered: true });
    }
    await auditCandidate(row, session, context, 'created');
    return present(row);
  });
}

export async function accessCandidate(context, operation, read) {
  return transaction(async session => {
    const course = await ownedCourse(context, session, !!operation);
    const row = await CourseRevision.findOne({ courseId: context.courseId, _id: context.revisionId }).session(session);
    if (!row) throw missing();
    if (!operation) return read ? read(row, session, context) : present(row);
    const editableStatus = operation === reopenCandidate ? 'rejected' : 'draft';
    if (row.status !== editableStatus || !row.active || row.revision !== context.input.expectedRevision
        || row.revision >= Number.MAX_SAFE_INTEGER) throw conflict();
    const changes = await operation(row, session, context, course);
    row.revision += 1;
    await row.save({ session });
    return { ...present(row), ...changes };
  });
}

export async function editMetadata(row, session, { input }) {
  if (input.categoryId) await requireActiveCategory(input.categoryId, session);
  const { expectedRevision, ...fields } = input;
  void expectedRevision;
  row.metadata.set(fields);
}

async function auditCandidate(row, session, { auth }, action) {
  await appendAuditEvent({ session, occurredAt: new Date(), input: { actorType: 'user',
    actorId: auth.userId, action: 'course_revision.' + action, targetType: 'course_revision',
    targetId: row.id, toStatus: row.status } });
}

export async function discardCandidate(row, session, context) {
  await cleanupCandidateMedia(row._id, session);
  await cleanupCandidateVideos(row._id, session);
  row.status = 'discarded';
  row.active = false;
  await auditCandidate(row, session, context, 'discarded');
}

// Review decisions live in their own history; reopening only changes editor state.
export function reopenCandidate(row) {
  row.status = 'draft';
}
