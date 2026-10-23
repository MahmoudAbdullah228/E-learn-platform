import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { assertTransactionSupport } from '../src/config/transactions.js';
import { Category } from '../src/models/Category.js';
import { Course } from '../src/models/Course.js';
import { CourseReviewEvent } from '../src/models/CourseReviewEvent.js';
import { Lesson } from '../src/models/Lesson.js';
import { MediaAsset } from '../src/models/MediaAsset.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { Section } from '../src/models/Section.js';
import { User } from '../src/models/User.js';
import { VideoAssetState } from '../src/models/VideoAssetState.js';
import { createSessionService } from '../src/modules/auth/session.service.js';

const password = 'course review integration password';
let webhookEvent;
const app = createApp({ videoProvider: { async unwrapWebhook() { return webhookEvent; } } });
let databaseReady = false;
const models = [CourseReviewEvent, VideoAssetState, MediaAsset, Lesson, Section, Course,
  Category, RefreshSession, User];

before(async () => {
  await connectDatabase({ maxRetries: 1 });
  assert.match(mongoose.connection.name, /_test$/);
  await assertTransactionSupport();
  await Promise.all(models.map(Model => Model.init()));
  databaseReady = true;
});
beforeEach(async () => {
  await Promise.all(models.map(Model => Model.deleteMany({})));
});
after(async () => {
  try {
    if (databaseReady && mongoose.connection.readyState === 1) {
      await Promise.all(models.map(Model => Model.deleteMany({})));
    }
  } finally { await disconnectDatabase(); }
});

async function actor(email, roles) {
  const user = await User.create({ name: 'Review Actor', email,
    passwordHash: await bcrypt.hash(password, 10), emailVerifiedAt: new Date(), roles,
    instructorStatus: roles.includes('instructor') ? 'approved' : 'none' });
  const session = await createSessionService().login({ email, password });
  return { user, token: session.accessToken };
}

const auth = (method, path, token) => request(app)[method](path)
  .auth(token, { type: 'bearer' });

async function fixture({ ready = true } = {}) {
  const owner = await actor('review-owner@example.test', ['student', 'instructor']);
  const admin = await actor('review-admin@example.test', ['admin']);
  const category = await Category.create({ name: 'Review Category', slug: 'review-category' });
  const course = await Course.create({
    instructorId: owner.user.id, categoryId: category.id,
    title: 'Production Course', slug: 'production-course',
    description: 'Complete production course description for review.',
    shortDescription: 'Practical production learning', level: 'intermediate', language: 'en',
    priceMinor: 1000,
  });
  const section = await Section.create({ courseId: course.id, title: 'Introduction', position: 0 });
  const lesson = await Lesson.create({ sectionId: section.id, title: 'First Lesson', position: 0,
    videoStatus: ready ? 'ready' : 'pending', videoAssetId: ready ? 'mux-review-asset' : null,
    videoUploadAttemptId: '11111111-1111-4111-8111-111111111111' });
  const asset = await MediaAsset.create({
    ownerId: owner.user.id, purpose: 'course_cover', targetId: course.id,
    publicId: `review-cover-${course.id}`, resourceType: 'image', deliveryType: 'upload',
    status: 'ready', bytes: 1024, format: 'png', providerAssetId: `provider-${course.id}`,
    expiresAt: new Date(Date.now() + 600000),
    providerUploadValidUntil: new Date(Date.now() + 3600000),
  });
  await Course.updateOne({ _id: course.id }, { $set: { coverAssetId: asset.id } });
  return { owner, admin, category, course, section, lesson, asset };
}

test('submission requires complete content and persists no partial transition', async () => {
  const { owner, course, asset, lesson, category } = await fixture();
  await auth('post', `/api/v1/instructor/courses/${course.id}/submit-review`, owner.token)
    .send({ status: 'published' }).expect(400);
  await Course.updateOne({ _id: course.id }, { $set: { coverAssetId: null } });
  const missingCover = await auth('post',
    `/api/v1/instructor/courses/${course.id}/submit-review`, owner.token).expect(409);
  assert.equal(missingCover.body.error.code, 'COURSE_NOT_READY');
  assert.equal(missingCover.body.error.details[0].field, 'coverAssetId');
  assert.equal((await Course.findById(course.id)).status, 'draft');
  assert.equal(await CourseReviewEvent.countDocuments(), 0);
  await Course.updateOne({ _id: course.id }, { $set: { coverAssetId: asset.id } });
  await Lesson.updateOne({ _id: lesson.id }, { $set: { videoStatus: 'failed' } });
  const unready = await auth('post',
    `/api/v1/instructor/courses/${course.id}/submit-review`, owner.token).expect(409);
  assert.equal(unready.body.error.details[0].field, 'lessons');
  await Lesson.updateOne({ _id: lesson.id }, { $set: { videoStatus: 'ready' } });
  await Category.updateOne({ _id: category.id }, { $set: { isActive: false } });
  const inactive = await auth('post',
    `/api/v1/instructor/courses/${course.id}/submit-review`, owner.token).expect(409);
  assert.equal(inactive.body.error.details[0].field, 'categoryId');
});

test('review publishes only ready pending content and writes atomic audit', async () => {
  const { owner, admin, course } = await fixture();
  const submitPath = `/api/v1/instructor/courses/${course.id}/submit-review`;
  const submitted = await auth('post', submitPath, owner.token).expect(200);
  assert.equal(submitted.body.data.course.status, 'pending_review');
  assert.ok(submitted.body.data.course.submittedAt);
  await auth('post', submitPath, owner.token).expect(409);
  await auth('patch', `/api/v1/instructor/courses/${course.id}`, owner.token)
    .send({ title: 'Changed During Review' }).expect(409);
  const queue = await auth('get', '/api/v1/admin/courses', admin.token).expect(200);
  assert.deepEqual(queue.body.data.courses.map(item => item.id), [course.id]);
  const details = await auth('get', `/api/v1/admin/courses/${course.id}`, admin.token).expect(200);
  assert.equal(details.body.data.sections[0].lessons[0].videoStatus, 'ready');
  assert.equal(details.body.data.reviewEvents[0].action, 'submitted');
  assert.equal(JSON.stringify(details.body).includes('videoAssetId'), false);
  const approved = await auth('patch', `/api/v1/admin/courses/${course.id}/review`, admin.token)
    .send({ decision: 'approve' }).expect(200);
  assert.equal(approved.body.data.course.status, 'published');
  assert.equal(approved.body.data.course.reviewedBy, admin.user.id);
  assert.ok(approved.body.data.course.publishedAt);
  await auth('patch', `/api/v1/admin/courses/${course.id}/review`, admin.token)
    .send({ decision: 'approve' }).expect(409);
  assert.deepEqual((await CourseReviewEvent.find({ courseId: course.id })
    .sort({ occurredAt: 1 })).map(event => event.action), ['submitted', 'approved']);
});

test('rejection requires reason and reopening preserves history without auto-resubmission', async () => {
  const { owner, admin, course } = await fixture();
  await auth('post', `/api/v1/instructor/courses/${course.id}/submit-review`, owner.token)
    .expect(200);
  const reviewPath = `/api/v1/admin/courses/${course.id}/review`;
  await auth('patch', reviewPath, admin.token).send({ decision: 'reject' }).expect(400);
  const rejected = await auth('patch', reviewPath, admin.token)
    .send({ decision: 'reject', reason: 'Needs better teaching examples' }).expect(200);
  assert.equal(rejected.body.data.course.rejectionReason, 'Needs better teaching examples');
  await auth('patch', `/api/v1/instructor/courses/${course.id}`, owner.token)
    .send({ title: 'Revised' }).expect(409);
  const reopened = await auth('post', `/api/v1/instructor/courses/${course.id}/reopen`,
    owner.token).expect(200);
  assert.equal(reopened.body.data.course.status, 'draft');
  assert.equal(reopened.body.data.course.rejectionReason, null);
  await auth('patch', `/api/v1/instructor/courses/${course.id}`, owner.token)
    .send({ title: 'Revised Production Course' }).expect(200);
  assert.deepEqual((await CourseReviewEvent.find({ courseId: course.id })
    .sort({ occurredAt: 1 })).map(event => event.action), ['submitted', 'rejected', 'reopened']);
});

test('provider video deletion after submission prevents approval', async () => {
  const { owner, admin, course } = await fixture();
  await auth('post', `/api/v1/instructor/courses/${course.id}/submit-review`, owner.token)
    .expect(200);
  webhookEvent = { type: 'video.asset.deleted', data: { id: 'mux-review-asset' } };
  await request(app).post('/api/v1/webhooks/video').set('Content-Type', 'application/json')
    .send({ type: 'video.asset.deleted' }).expect(200);
  const rejected = await auth('patch', `/api/v1/admin/courses/${course.id}/review`, admin.token)
    .send({ decision: 'approve' }).expect(409);
  assert.equal(rejected.body.error.code, 'COURSE_CHANGED_DURING_REVIEW');
  assert.equal((await Course.findById(course.id)).status, 'pending_review');
  assert.equal(await CourseReviewEvent.countDocuments({ action: 'approved' }), 0);
});

test('a ready-video webhook changing the reviewed version blocks publication', async () => {
  const { owner, admin, course } = await fixture();
  await auth('post', `/api/v1/instructor/courses/${course.id}/submit-review`, owner.token)
    .expect(200);
  webhookEvent = { type: 'video.asset.ready', data: { id: 'mux-review-asset',
    passthrough: '11111111-1111-4111-8111-111111111111', duration: 41 } };
  await request(app).post('/api/v1/webhooks/video').set('Content-Type', 'application/json')
    .send({ type: 'video.asset.ready' }).expect(200);
  const response = await auth('patch', `/api/v1/admin/courses/${course.id}/review`, admin.token)
    .send({ decision: 'approve' }).expect(409);
  assert.equal(response.body.error.code, 'COURSE_CHANGED_DURING_REVIEW');
  assert.equal((await Course.findById(course.id)).status, 'pending_review');
});

test('duplicate ready webhook does not invalidate an unchanged review submission', async () => {
  const { owner, admin, course } = await fixture();
  webhookEvent = { type: 'video.asset.ready', data: { id: 'mux-review-asset',
    passthrough: '11111111-1111-4111-8111-111111111111', duration: 41 } };
  await request(app).post('/api/v1/webhooks/video').set('Content-Type', 'application/json')
    .send({ type: 'video.asset.ready' }).expect(200);
  await auth('post', `/api/v1/instructor/courses/${course.id}/submit-review`, owner.token)
    .expect(200);
  const revision = (await Course.findById(course.id).select('+curriculumRevision')).curriculumRevision;
  await request(app).post('/api/v1/webhooks/video').set('Content-Type', 'application/json')
    .send({ type: 'video.asset.ready' }).expect(200);
  assert.equal((await Course.findById(course.id).select('+curriculumRevision')).curriculumRevision,
    revision);
  await auth('patch', `/api/v1/admin/courses/${course.id}/review`, admin.token)
    .send({ decision: 'approve' }).expect(200);
});

test('provider deletion unpublishes atomically and owner explicitly reopens for repair', async () => {
  const { owner, admin, course, lesson } = await fixture();
  await auth('post', `/api/v1/instructor/courses/${course.id}/submit-review`, owner.token)
    .expect(200);
  await auth('patch', `/api/v1/admin/courses/${course.id}/review`, admin.token)
    .send({ decision: 'approve' }).expect(200);
  webhookEvent = { type: 'video.asset.deleted', data: { id: 'mux-review-asset' } };
  await request(app).post('/api/v1/webhooks/video').set('Content-Type', 'application/json')
    .send({ type: 'video.asset.deleted' }).expect(200);
  const unavailable = await Course.findById(course.id);
  assert.equal(unavailable.status, 'unavailable');
  assert.ok(unavailable.unavailableAt);
  assert.equal((await Lesson.findById(lesson.id)).videoStatus, 'failed');
  await request(app).post('/api/v1/webhooks/video').set('Content-Type', 'application/json')
    .send({ type: 'video.asset.deleted' }).expect(200);
  assert.equal(await CourseReviewEvent.countDocuments({ courseId: course.id,
    action: 'unpublished' }), 1);
  const audit = await auth('get', `/api/v1/admin/courses/${course.id}`, admin.token).expect(200);
  assert.equal(audit.body.data.reviewEvents[0].actorId, null);
  const blocked = await auth('patch', `/api/v1/instructor/courses/${course.id}`, owner.token)
    .send({ title: 'Edit only after reopening' }).expect(409);
  assert.equal(blocked.body.error.code, 'INVALID_COURSE_STATE');
  const reopened = await auth('post', `/api/v1/instructor/courses/${course.id}/reopen`,
    owner.token).expect(200);
  assert.equal(reopened.body.data.course.status, 'draft');
  assert.equal(reopened.body.data.course.unavailableAt, null);
  assert.equal(reopened.body.data.course.publishedAt, null);
  assert.equal((await CourseReviewEvent.findOne({ courseId: course.id, action: 'reopened' }))
    .fromStatus, 'unavailable');
  const incomplete = await auth('post', `/api/v1/instructor/courses/${course.id}/submit-review`,
    owner.token).expect(409);
  assert.equal(incomplete.body.error.code, 'COURSE_NOT_READY');
  await Lesson.updateOne({ _id: lesson.id }, { $set: {
    videoStatus: 'ready', videoAssetId: 'replacement-mux-asset',
  } });
  const resubmitted = await auth('post',
    `/api/v1/instructor/courses/${course.id}/submit-review`, owner.token).expect(200);
  assert.equal(resubmitted.body.data.course.status, 'pending_review');
});

test('deletion for a different asset cannot unpublish a ready lesson with the same attempt', async () => {
  const { owner, admin, course, lesson } = await fixture();
  await auth('post', `/api/v1/instructor/courses/${course.id}/submit-review`, owner.token)
    .expect(200);
  await auth('patch', `/api/v1/admin/courses/${course.id}/review`, admin.token)
    .send({ decision: 'approve' }).expect(200);
  webhookEvent = { type: 'video.asset.deleted', data: { id: 'unrelated-asset',
    passthrough: '11111111-1111-4111-8111-111111111111' } };
  const response = await request(app).post('/api/v1/webhooks/video')
    .set('Content-Type', 'application/json').send({ type: 'video.asset.deleted' }).expect(200);
  assert.equal(response.body.data.handled, false);
  assert.equal((await Course.findById(course.id)).status, 'published');
  assert.equal((await Lesson.findById(lesson.id)).videoStatus, 'ready');
  assert.equal(await CourseReviewEvent.countDocuments({ action: 'unpublished' }), 0);
});

test('simultaneous review decisions commit at most one transition', async () => {
  const { owner, admin, course } = await fixture();
  await auth('post', `/api/v1/instructor/courses/${course.id}/submit-review`, owner.token)
    .expect(200);
  const results = await Promise.all([1, 2].map(() => auth('patch',
    `/api/v1/admin/courses/${course.id}/review`, admin.token).send({ decision: 'approve' })));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(await CourseReviewEvent.countDocuments({ courseId: course.id, action: 'approved' }), 1);
});

test('review endpoints enforce current roles, ownership, and active instructor approval', async () => {
  const { owner, admin, course } = await fixture();
  const stranger = await actor('review-stranger@example.test', ['student', 'instructor']);
  const student = await actor('review-student@example.test', ['student']);
  const submitPath = `/api/v1/instructor/courses/${course.id}/submit-review`;
  await auth('post', submitPath, student.token).expect(403);
  await auth('post', submitPath, stranger.token).expect(404);
  await auth('get', '/api/v1/admin/courses', owner.token).expect(403);
  await auth('patch', `/api/v1/admin/courses/${course.id}/review`, owner.token)
    .send({ decision: 'approve' }).expect(403);
  await User.updateOne({ _id: owner.user.id }, { $set: { instructorStatus: 'rejected' } });
  const deapproved = await auth('post', submitPath, owner.token).expect(403);
  assert.equal(deapproved.body.error.code, 'INSTRUCTOR_NOT_APPROVED');
  assert.equal((await Course.findById(course.id)).status, 'draft');
  assert.equal(await CourseReviewEvent.countDocuments(), 0);
  await auth('get', '/api/v1/admin/courses', admin.token).expect(200);
});

for (const [label, update] of [
  ['suspended', { status: 'suspended' }],
  ['deapproved', { instructorStatus: 'rejected' }],
  ['role revoked', { roles: ['student'] }],
]) {
  test(`approval rejects an instructor ${label} after submission`, async () => {
    const { owner, admin, course } = await fixture();
    await auth('post', `/api/v1/instructor/courses/${course.id}/submit-review`, owner.token)
      .expect(200);
    await User.updateOne({ _id: owner.user.id }, { $set: update });
    const refused = await auth('patch', `/api/v1/admin/courses/${course.id}/review`, admin.token)
      .send({ decision: 'approve' }).expect(403);
    assert.equal(refused.body.error.code, 'INSTRUCTOR_NOT_APPROVED');
    assert.equal((await Course.findById(course.id)).status, 'pending_review');
    assert.equal(await CourseReviewEvent.countDocuments({ courseId: course.id,
      action: 'approved' }), 0);
    // Revocation must not prevent the admin from rejecting the stale submission.
    await auth('patch', `/api/v1/admin/courses/${course.id}/review`, admin.token)
      .send({ decision: 'reject', reason: 'Instructor no longer eligible' }).expect(200);
  });
}

test('account suspension racing approval aborts publication atomically', async t => {
  const { owner, admin, course } = await fixture();
  await auth('post', `/api/v1/instructor/courses/${course.id}/submit-review`, owner.token)
    .expect(200);
  let suspended = false;
  const original = User.findOneAndUpdate;
  t.mock.method(User, 'findOneAndUpdate', function (...args) {
    const query = original.apply(this, args);
    const originalExec = query.exec;
    query.exec = async function (...execArgs) {
      if (!suspended && this.getUpdate().$inc?.instructorReviewRevision) {
        suspended = true;
        // The course snapshot has already been read; force a conflicting account write.
        await User.updateOne({ _id: owner.user.id }, { $set: { status: 'suspended' } });
      }
      return originalExec.apply(this, execArgs);
    };
    return query;
  });
  const response = await auth('patch', `/api/v1/admin/courses/${course.id}/review`, admin.token)
    .send({ decision: 'approve' }).expect(403);
  assert.equal(suspended, true);
  assert.equal(response.body.error.code, 'INSTRUCTOR_NOT_APPROVED');
  assert.equal((await Course.findById(course.id)).status, 'pending_review');
  assert.equal(await CourseReviewEvent.countDocuments({ courseId: course.id,
    action: 'approved' }), 0);
});

test('account suspension racing approval aborts publication atomically', async t => {
  const { owner, admin, course } = await fixture();
  await auth('post', `/api/v1/instructor/courses/${course.id}/submit-review`, owner.token)
    .expect(200);
  let suspended = false;
  const original = User.findOneAndUpdate;
  t.mock.method(User, 'findOneAndUpdate', function (...args) {
    const query = original.apply(this, args);
    const originalExec = query.exec;
    query.exec = async function (...execArgs) {
      if (!suspended && this.getUpdate().$inc?.instructorReviewRevision) {
        suspended = true;
        // The course snapshot has already been read; force a conflicting account write.
        await User.updateOne({ _id: owner.user.id }, { $set: { status: 'suspended' } });
      }
      return originalExec.apply(this, execArgs);
    };
    return query;
  });
  const response = await auth('patch', `/api/v1/admin/courses/${course.id}/review`, admin.token)
    .send({ decision: 'approve' }).expect(403);
  assert.equal(suspended, true);
  assert.equal(response.body.error.code, 'INSTRUCTOR_NOT_APPROVED');
  assert.equal((await Course.findById(course.id)).status, 'pending_review');
  assert.equal(await CourseReviewEvent.countDocuments({ courseId: course.id,
    action: 'approved' }), 0);
});

test('approval rechecks category and pending media and curriculum remain locked', async () => {
  const { owner, admin, course, lesson, category } = await fixture();
  await auth('post', `/api/v1/instructor/courses/${course.id}/submit-review`, owner.token)
    .expect(200);
  const media = await auth('post', '/api/v1/media/upload-intents', owner.token)
    .send({ purpose: 'course_cover', targetId: course.id }).expect(409);
  assert.equal(media.body.error.code, 'INVALID_COURSE_STATE');
  await auth('post', `/api/v1/instructor/lessons/${lesson.id}/video-upload`, owner.token)
    .expect(409);
  await Category.updateOne({ _id: category.id }, { $set: { isActive: false } });
  const refused = await auth('patch', `/api/v1/admin/courses/${course.id}/review`, admin.token)
    .send({ decision: 'approve' }).expect(409);
  assert.equal(refused.body.error.details[0].field, 'categoryId');
  assert.equal((await Course.findById(course.id)).status, 'pending_review');
});
