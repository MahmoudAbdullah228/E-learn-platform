import assert from 'node:assert/strict';
import { test } from 'node:test';

import { archiveCourseInputSchema, courseAccessInputSchema } from '../src/modules/courseAdministration/courseAdministration.schemas.js';
import { hasCourseAccess, isPublicCourse, isLearningCourse, courseAvailabilityCode,
  publicCourseFilter, learningCourseFilter } from '../src/modules/courses/courseAccess.policy.js';
import { toCoursePolicy } from '../src/modules/courseAdministration/courseAdministration.presenter.js';

const reason = 'A documented security or archive decision';
test('course policy commands reject extra fields, unsafe revisions and raw control/format characters', () => {
  const input = { reason, expectedRevision: 0 };
  assert.deepEqual(archiveCourseInputSchema.parse(input), input);
  assert.equal(courseAccessInputSchema.safeParse({ ...input, accessStatus: 'blocked' }).success, true);
  for (const patch of [{ status: 'archived' }, { archivedBy: 'client' }, { expectedRevision: '0' },
    { expectedRevision: -1 }, { expectedRevision: 0.5 }, { expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
    { reason: 'short' }, { reason: `${reason}\n` }, { reason: `Hidden\u200B reason ${reason}` }]) {
    assert.equal(archiveCourseInputSchema.safeParse({ ...input, ...patch }).success, false);
  }
  assert.equal(courseAccessInputSchema.safeParse({ ...input, accessStatus: 'public' }).success, false);
});

test('shared access table retains archived entitlements without reopening discovery or preview', () => {
  assert.equal(isPublicCourse({ status: 'published' }), true);
  assert.equal(isLearningCourse({ status: 'published' }), true);
  assert.equal(isPublicCourse({ status: 'archived' }), false);
  assert.equal(isLearningCourse({ status: 'archived', accessStatus: 'available' }), true);
  for (const status of ['draft', 'pending_review', 'rejected', 'unavailable']) {
    assert.equal(isPublicCourse({ status }), false);
    assert.equal(isLearningCourse({ status }), false);
  }
  for (const accessStatus of ['blocked', 'unknown', null]) {
    assert.equal(hasCourseAccess({ accessStatus }), false);
    assert.equal(isPublicCourse({ status: 'published', accessStatus }), false);
    assert.equal(isLearningCourse({ status: 'archived', accessStatus }), false);
  }
  assert.equal(isLearningCourse({ status: 'archived', unavailableAt: new Date() }), false);
  assert.equal(isPublicCourse({ status: 'published', unavailableAt: new Date() }), false);
  assert.equal(isLearningCourse(null), false);
});

test('availability codes are safe and explicit without legal reasons or enrollment revival', () => {
  assert.equal(courseAvailabilityCode({ status: 'archived' }), 'AVAILABLE');
  assert.equal(courseAvailabilityCode({ status: 'published', accessStatus: 'blocked', accessReason: reason }), 'COURSE_ACCESS_BLOCKED');
  assert.equal(courseAvailabilityCode({ status: 'archived', unavailableAt: new Date() }), 'COURSE_UNAVAILABLE');
  assert.equal(courseAvailabilityCode(null), 'COURSE_UNAVAILABLE');
  assert.equal(courseAvailabilityCode({ status: 'archived' }, 'revoked'), 'ENROLLMENT_REVOKED');
});

test('query filters fail closed, accept additive legacy defaults, and return independent objects', () => {
  assert.deepEqual(publicCourseFilter({ _id: 'id' }), { _id: 'id', status: 'published', unavailableAt: null,
    $or: [{ accessStatus: 'available' }, { accessStatus: { $exists: false } }] });
  assert.deepEqual(learningCourseFilter().status, { $in: ['published', 'archived'] });
  const one = publicCourseFilter(); one.$or.push({ accidental: true });
  assert.equal(publicCourseFilter().$or.length, 2);
});

test('admin policy DTO does not return raw internal/provider/course content fields', () => {
  const result = toCoursePolicy({ _id: 'id', status: 'published', coverKey: 'private',
    curriculumRevision: 99, checkoutRevision: 99, learningRevision: 99 });
  assert.equal(result.revision, 0);
  assert.equal(result.accessStatus, 'available');
  assert.equal(result.archiveReason, null);
  for (const name of ['coverKey', 'curriculumRevision', 'checkoutRevision', 'learningRevision']) {
    assert.equal(name in result, false);
  }
});
