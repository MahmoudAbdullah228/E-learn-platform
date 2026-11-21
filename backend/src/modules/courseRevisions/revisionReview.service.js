import mongoose from 'mongoose';

import { AdminAuditEvent } from '../../models/AdminAuditEvent.js';
import { Course } from '../../models/Course.js';
import { CourseRevision } from '../../models/CourseRevision.js';
import { User } from '../../models/User.js';
import { fenceActiveAdmin } from '../../services/adminAuthorization.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { appendAuditEvent } from '../audit/audit.service.js';
import { assertCourseReady } from '../courseReview/courseReadiness.service.js';
import { present } from './courseRevisions.service.js';
import { publishChanges, revisionDiff } from './revisionPublication.service.js';

const missing = () => new ApiError(404, 'REVISION_NOT_FOUND', 'Course revision was not found');
const conflict = () => new ApiError(409, 'STATE_CONFLICT', 'Reload the course and revision before continuing');
const transaction = work => mongoose.connection.transaction(work, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });

async function validateCandidate(row, course, session) {
  if (course.status !== 'published' || course.unavailableAt || row.baseContentRevision !== (course.curriculumRevision ?? 0)) throw conflict();
  await assertCourseReady({ ...row.metadata.toObject(), _id: course._id, instructorId: course.instructorId,
    accessStatus: course.accessStatus }, session, row._id);
  const changes = await revisionDiff(row, course, session, true);
  if (!changes.length) throw new ApiError(409, 'REVISION_UNCHANGED', 'Change the course before submitting a revision');
  return changes;
}

function record(row, session, auth, fromStatus, reason) {
  return appendAuditEvent({ session, occurredAt: new Date(), input: { actorType: 'user', actorId: auth.userId,
    action: 'course_revision.' + (row.status === 'pending_review' ? 'submitted' : row.status),
    targetType: 'course_revision', targetId: row.id, fromStatus, toStatus: row.status, reason } });
}

export async function submitCandidate(row, session, { auth }, course) {
  await validateCandidate(row, course, session);
  row.status = 'pending_review';
  row.submittedAt = new Date();
  row.rejectionReason = null;
  await record(row, session, auth, 'draft', null);
}

export function decideRevision(approve) {
  return ({ revisionId, auth, input }) => transaction(async session => {
    await fenceActiveAdmin({ auth, session, now: new Date() });
    const row = await CourseRevision.findById(revisionId).session(session);
    if (!row) throw missing();
    if (!row.active || row.status !== 'pending_review' || row.revision !== input.expectedRevision
        || row.baseContentRevision !== input.baseContentRevision) throw conflict();
    if (approve) {
      const course = await Course.findById(row.courseId).select('+curriculumRevision').session(session);
      if (!course) throw missing();
      const instructor = await User.findOneAndUpdate({ _id: course.instructorId, roles: 'instructor',
        instructorStatus: 'approved', status: 'active' }, { $inc: { instructorReviewRevision: 1 } }, { session, timestamps: false });
      if (!instructor) throw conflict();
      const changes = await validateCandidate(row, course, session);
      await publishChanges(changes, course, row, session);
      row.active = false;
    }
    row.status = approve ? 'approved' : 'rejected';
    row.rejectionReason = input.reason ?? null;
    row.revision++;
    await row.save({ session });
    await record(row, session, auth, 'pending_review', row.rejectionReason);
    return present(row);
  });
}

export async function listPending({ after }) {
  const rows = await CourseRevision.find({ status: 'pending_review', ...(after ? { _id: { $lt: after } } : {}) })
    .sort({ _id: -1 }).limit(51);
  return { items: rows.slice(0, 50).map(present), nextAfter: rows.length > 50 ? rows[49].id : null };
}

export function reviewDetail({ revisionId }) {
  return transaction(async session => {
    const row = await CourseRevision.findById(revisionId).session(session);
    if (!row) throw missing();
    const course = await Course.findById(row.courseId).select('+curriculumRevision').session(session).lean();
    if (!course) throw missing();
    const diff = await revisionDiff(row, course, session);
    const history = await AdminAuditEvent.find({ targetType: 'course_revision', targetId: row._id })
      .select('action actorId occurredAt reason -_id').sort({ occurredAt: -1, _id: -1 }).limit(50).session(session).lean();
    const safe = value => value && Object.fromEntries(Object.entries(value).filter(([key]) =>
      ['title','shortDescription','description','categoryId','coverAssetId','level','language','requirements','learningOutcomes',
        'currency','priceMinor','position','sectionId','isPreview','attachments','videoStatus','durationSeconds'].includes(key)));
    return { ...present(row), currentContentRevision: course.curriculumRevision ?? 0, history,
      changes: diff.map(({ kind, id, before, fields }) => ({ kind, id, before: safe(before) ?? null,
        after: safe(fields) ?? null, videoChanged: kind === 'lesson' && before?.videoAssetId !== fields?.videoAssetId })) };
  });
}
