import mongoose from 'mongoose';

import { Course } from '../../models/Course.js';
import { fenceActiveAdmin } from '../../services/adminAuthorization.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { adminActorSchema } from '../../utils/actorSchemas.js';
import { appendAuditEvent } from '../audit/audit.service.js';
import { financialIdSchema } from '../finance/finance.schemas.js';
import { correctionInputSchema, archiveCourseInputSchema, courseAccessInputSchema } from './courseAdministration.schemas.js';
import { adminCoursePolicyProjection, toCoursePolicy } from './courseAdministration.presenter.js';

const transactionOptions = { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 10_000 };
const conflict = () => new ApiError(409, 'STATE_CONFLICT', 'Course policy changed; reload before trying again');

export function createCourseAdministrationService({ clock = () => new Date() } = {}) {
  async function mutate({ auth, courseId, input, requestId }, archive) {
    auth = adminActorSchema.parse(auth);
    courseId = financialIdSchema.parse(courseId);
    input = (archive ? archiveCourseInputSchema : courseAccessInputSchema).parse(input);
    return mongoose.connection.transaction(async session => {
      const now = clock();
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('Invalid course policy clock');
      await fenceActiveAdmin({ auth, session, now });
      // Lock the same document used by Checkout, free enrollment, progress and media
      // lifecycle transactions. A policy read followed by an unrelated write is not a fence.
      const course = await Course.findById(courseId).select(adminCoursePolicyProjection).session(session);
      if (!course) throw new ApiError(404, 'COURSE_NOT_FOUND', 'Course was not found');
      if (course.policyRevision !== input.expectedRevision) throw conflict();
      if ((archive && course.status === 'archived') || (!archive && course.accessStatus === input.accessStatus)) {
        return { course: toCoursePolicy(course), changed: false };
      }
      if (archive && !['published', 'unavailable'].includes(course.status)) {
        throw new ApiError(409, 'INVALID_COURSE_STATE', 'Only published or unavailable courses can be archived');
      }
      if (!Number.isSafeInteger(course.policyRevision) || course.policyRevision >= Number.MAX_SAFE_INTEGER) {
        throw new ApiError(409, 'COURSE_POLICY_REQUIRES_REVIEW', 'Course policy requires operational review');
      }
      const changes = archive ? { status: 'archived', archivedAt: now, archivedBy: auth.userId, archiveReason: input.reason }
        : { accessStatus: input.accessStatus, accessChangedAt: now, accessChangedBy: auth.userId, accessReason: input.reason };
      const updated = await Course.findOneAndUpdate({ _id: courseId, status: course.status,
        $or: [{ policyRevision: input.expectedRevision },
          ...(input.expectedRevision === 0 ? [{ policyRevision: { $exists: false } }] : [])] },
      { $set: changes, $inc: { policyRevision: 1 } }, { session, returnDocument: 'after', runValidators: true })
        .select(adminCoursePolicyProjection);
      if (!updated) throw conflict();
      await appendAuditEvent({ session, occurredAt: now, input: {
        actorType: 'user', actorId: auth.userId, action: archive ? 'course.archived' : 'course.access_policy_changed',
        targetType: 'course', targetId: courseId, reason: input.reason, requestId: requestId ?? null,
        fromStatus: archive ? course.status : course.accessStatus,
        toStatus: archive ? 'archived' : input.accessStatus,
      } });
      return { course: toCoursePolicy(updated), changed: true };
    }, transactionOptions);
  }
  async function correct({ auth, courseId, input, requestId }) {
    auth = adminActorSchema.parse(auth);
    courseId = financialIdSchema.parse(courseId);
    const { reason, expectedRevision, ...fields } = correctionInputSchema.parse(input);
    return mongoose.connection.transaction(async session => {
      const now = clock();
      await fenceActiveAdmin({ auth, session, now });
      const course = await Course.findById(courseId).select('+curriculumRevision').session(session);
      if (!course) throw new ApiError(404, 'COURSE_NOT_FOUND', 'Course was not found');
      if (course.status !== 'published') throw new ApiError(409, 'INVALID_COURSE_STATE',
        'Only published courses accept text corrections');
      if (course.curriculumRevision !== expectedRevision || expectedRevision >= Number.MAX_SAFE_INTEGER) {
        throw new ApiError(409, 'STATE_CONFLICT', 'Reload the current content revision');
      }
      if (Object.entries(fields).some(([key, value]) => course[key] !== value)) {
        course.set(fields);
        course.curriculumRevision += 1;
        await course.save({ session, validateModifiedOnly: true });
        await appendAuditEvent({ session, occurredAt: now, input: { actorType: 'user', actorId: auth.userId,
          action: 'course.corrected', targetType: 'course', targetId: courseId, reason, requestId } });
      }
      return { id: course.id, title: course.title, shortDescription: course.shortDescription,
        contentRevision: course.curriculumRevision };
    }, transactionOptions);
  }
  return Object.freeze({ correct, archive: input => mutate(input, true), changeAccess: input => mutate(input, false) });
}
