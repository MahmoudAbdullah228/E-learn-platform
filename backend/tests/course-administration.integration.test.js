import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';

import mongoose from 'mongoose';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { assertTransactionSupport } from '../src/config/transactions.js';
import { AdminAuditEvent } from '../src/models/AdminAuditEvent.js';
import { Category } from '../src/models/Category.js';
import { Course } from '../src/models/Course.js';
import { RevisionBeforeImage } from '../src/models/RevisionBeforeImage.js';
import { CourseRevision, RevisionLesson, RevisionSection } from '../src/models/CourseRevision.js';
import { CourseReviewEvent } from '../src/models/CourseReviewEvent.js';
import { Enrollment } from '../src/models/Enrollment.js';
import { Lesson } from '../src/models/Lesson.js';
import { LessonProgress } from '../src/models/LessonProgress.js';
import { MediaAsset } from '../src/models/MediaAsset.js';
import { Order } from '../src/models/Order.js';
import { Payment } from '../src/models/Payment.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { Section } from '../src/models/Section.js';
import { User } from '../src/models/User.js';
import { MediaCleanupJob } from '../src/models/MediaCleanupJob.js';
import { VideoCleanupJob } from '../src/models/VideoCleanupJob.js';
import { VideoAssetState } from '../src/models/VideoAssetState.js';
import { VideoPlaybackLease } from '../src/models/VideoPlaybackLease.js';
import { createCourseAdministrationService } from '../src/modules/courseAdministration/courseAdministration.service.js';
import { createCheckoutService } from '../src/modules/checkout/checkout.service.js';
import { createVideoService } from '../src/modules/video/video.service.js';
import { signAccessToken } from '../src/utils/sessionToken.js';

const models = [RevisionBeforeImage, MediaCleanupJob, VideoCleanupJob, CourseRevision, RevisionLesson, RevisionSection, AdminAuditEvent, VideoPlaybackLease, VideoAssetState, LessonProgress, CourseReviewEvent,
  Payment, Order, Enrollment, MediaAsset, Lesson, Section, Course, Category, RefreshSession, User];
const reason = 'Private legal security case reference for administrators';
let ready = false;
let app;
let videoCalls;
let pdfCalls;
let paymentCalls;
let videoHook;
let pdfHook;
let paymentHook;
const videoProvider = {
  async ensureSignedPlaybackId() { videoCalls++; await videoHook?.(); return 'signed-playback-id'; },
  async signPlaybackToken() { return { token: 'private-signed-token', expiresAt: new Date(Date.now() + 900_000) }; },
};
const mediaProvider = {
  publicImageUrl: () => 'https://example.test/cover.jpg',
  async createPrivateDownload() { pdfCalls++; await pdfHook?.();
    return { url: 'https://example.test/private-pdf', expiresAt: new Date(Date.now() + 60_000) }; },
};
const paymentProvider = {
  checkoutSettings: () => ({ checkoutExpiresSeconds: 3600, successUrl: 'https://example.test/success',
    cancelUrl: 'https://example.test/cancel' }),
  async createCheckoutSession(input) {
    paymentCalls++; await paymentHook?.();
    return { id: `cs_test_${input.orderId}`, orderId: input.orderId, metadataOrderId: input.orderId,
      amountMinor: input.amountMinor, currency: 'EGP', status: 'open', paymentStatus: 'unpaid',
      expiresAt: new Date(input.expiresAtSeconds * 1000), url: 'https://checkout.stripe.com/c/pay/test' };
  },
};
const newApp = options => createApp({ videoProvider, mediaProvider, paymentProvider, ...options });
before(async () => {
  await connectDatabase({ maxRetries: 1 });
  assert.match(mongoose.connection.name, /_test$/);
  await assertTransactionSupport();
  await Promise.all(models.map(Model => Model.init())); ready = true;
});
async function clear() {
  assert.equal(ready && mongoose.connection.readyState === 1, true);
  assert.match(mongoose.connection.name, /_test$/);
  await Promise.all(models.map(Model => Model.collection.deleteMany({})));
}
beforeEach(async () => { await clear(); videoCalls = 0; pdfCalls = 0; paymentCalls = 0;
  videoHook = undefined; pdfHook = undefined; paymentHook = undefined; app = newApp(); });
after(async () => { try { if (ready && mongoose.connection.readyState === 1) await clear(); }
  finally { await disconnectDatabase(); } });

async function actor(roles = ['student']) {
  const user = await User.create({ name: 'Course Policy User', email: `${randomUUID()}@example.test`, roles,
    instructorStatus: roles.includes('instructor') ? 'approved' : 'none', passwordHash: 'unused-test-hash',
    emailVerifiedAt: new Date() });
  const familyId = randomUUID();
  await RefreshSession.create({ userId: user.id, familyId, tokenHash: randomUUID(), tokenVersion: 0,
    expiresAt: new Date(Date.now() + 86400_000) });
  const auth = { userId: user.id, roles, familyId, tokenVersion: 0 };
  return { user, auth, token: await signAccessToken(auth) };
}
async function fixture({ status = 'published', enrolled = true, priceMinor = 1000 } = {}) {
  const admin = await actor(['admin']);
  const owner = await actor(['student', 'instructor']);
  const student = await actor();
  const category = await Category.create({ name: 'Course Policy', slug: 'course-policy' });
  const course = await Course.create({ instructorId: owner.user.id, categoryId: category.id,
    title: 'Course Policy Test', slug: 'course-policy-test', description: 'A course for archive and access policy testing.',
    shortDescription: 'A safe published course summary', level: 'beginner', language: 'en',
    priceMinor, status, publishedAt: ['published', 'unavailable'].includes(status) ? new Date() : null,
    unavailableAt: status === 'unavailable' ? new Date() : null });
  const section = await Section.create({ courseId: course.id, title: 'First Section', position: 0 });
  const lesson = await Lesson.create({ sectionId: section.id, title: 'First Lesson', position: 0,
    videoStatus: 'ready', videoAssetId: 'policy-video-asset', isPreview: true });
  const asset = await MediaAsset.create({ ownerId: owner.user.id, purpose: 'lesson_attachment', targetId: lesson.id,
    publicId: 'elearn/lesson_attachment/policy-file', resourceType: 'raw', deliveryType: 'authenticated',
    status: 'ready', format: 'pdf', bytes: 2048, attachedAt: new Date(),
    expiresAt: new Date(Date.now() - 60_000), providerUploadValidUntil: new Date(Date.now() - 60_000) });
  await Lesson.updateOne({ _id: lesson.id }, { $set: { attachments: [asset.id] } });
  if (enrolled) await Enrollment.create({ studentId: student.user.id, courseId: course.id, enrolledAt: new Date() });
  return { admin, owner, student, course, section, lesson, asset };
}
const policyPath = f => `/api/v1/admin/courses/${f.course.id}`;
const playbackPath = f => `/api/v1/lessons/${f.lesson.id}/playback`;
const pdfPath = f => `/api/v1/lessons/${f.lesson.id}/attachments/${f.asset.id}/download`;
const learningPath = f => `/api/v1/users/me/courses/${f.course.id}`;
const read = (path, actor) => { const req = request(app).get(path); return actor ? req.auth(actor.token, { type: 'bearer' }) : req; };
const archive = (f, expectedRevision = 0) => request(app).post(`${policyPath(f)}/archive`)
  .auth(f.admin.token, { type: 'bearer' }).send({ reason, expectedRevision });
const access = (f, accessStatus = 'blocked', expectedRevision = 0) => request(app).patch(`${policyPath(f)}/access-policy`)
  .auth(f.admin.token, { type: 'bearer' }).send({ accessStatus, reason, expectedRevision });
const progress = (f, completed = true) => request(app).put(`${learningPath(f)}/lessons/${f.lesson.id}/progress`)
  .auth(f.student.token, { type: 'bearer' }).send({ completed });

test('policy endpoints require active admins and strict bodies, params and query with safe no-store errors', async () => {
  const f = await fixture();
  await request(app).post(`${policyPath(f)}/archive`).send({ reason, expectedRevision: 0 }).expect(401);
  await request(app).post(`${policyPath(f)}/archive`).auth(f.owner.token, { type: 'bearer' })
    .send({ reason, expectedRevision: 0 }).expect(403);
  for (const patch of [{ status: 'archived' }, { archivedBy: f.admin.user.id }, { expectedRevision: '0' },
    { reason: 'short' }, { reason: `${reason}\n` }]) {
    await request(app).post(`${policyPath(f)}/archive`).auth(f.admin.token, { type: 'bearer' })
      .send({ reason, expectedRevision: 0, ...patch }).expect(400);
  }
  await request(app).post(`${policyPath(f)}/archive?extra=true`).auth(f.admin.token, { type: 'bearer' })
    .send({ reason, expectedRevision: 0 }).expect(400);
  const invalid = await request(app).post('/api/v1/admin/courses/bad-id/archive')
    .auth(f.admin.token, { type: 'bearer' }).send({ reason, expectedRevision: 0 }).expect(400);
  assert.equal(invalid.headers['cache-control'], 'no-store');
  const malformed = await request(app).post(`${policyPath(f)}/archive`).auth(f.admin.token, { type: 'bearer' })
    .set('Content-Type', 'application/json').send('{broken').expect(400);
  assert.equal(malformed.headers['cache-control'], 'no-store');
  assert.equal(await AdminAuditEvent.countDocuments(), 0);
});

test('archive preserves content/enrollment while removing catalog, anonymous preview and new purchase/free enrollment', async () => {
  const f = await fixture();
  const before = await Enrollment.findOne().lean();
  const result = await archive(f).expect(200);
  assert.equal(result.body.data.course.status, 'archived');
  assert.equal(result.body.data.course.revision, 1);
  assert.equal(result.body.data.course.archiveReason, reason);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.deepEqual(await Enrollment.findOne().lean(), before);
  assert.equal(await Lesson.countDocuments(), 1);
  assert.equal(await MediaAsset.countDocuments(), 1);
  const catalog = await read('/api/v1/courses').expect(200);
  assert.deepEqual(catalog.body.data.courses, []);
  await read(`/api/v1/courses/${f.course.slug}`).expect(404);
  await read(playbackPath(f)).expect(404);
  const stranger = await actor();
  await read(playbackPath(f), stranger).expect(404);
  await request(app).post(`/api/v1/courses/${f.course.id}/checkout`).auth(stranger.token, { type: 'bearer' }).expect(404);
  await request(app).post(`/api/v1/courses/${f.course.id}/enroll`).auth(stranger.token, { type: 'bearer' }).expect(404);
  assert.equal(paymentCalls, 0);
  assert.equal(await Order.countDocuments(), 0);
  await request(app).post(`/api/v1/instructor/courses/${f.course.id}/reopen`)
    .auth(f.owner.token, { type: 'bearer' }).expect(409);
});

test('archived active learners retain library outlines, signed video, private PDF, completion and resume', async () => {
  const f = await fixture(); await archive(f).expect(200);
  const list = await read('/api/v1/users/me/courses', f.student).expect(200);
  const entry = list.body.data.courses[0];
  assert.equal(entry.available, true); assert.equal(entry.availabilityCode, 'AVAILABLE');
  assert.equal(entry.course.status, 'archived');
  assert.ok(entry.course.archivedAt);
  assert.equal(JSON.stringify(list.body).includes(reason), false);
  await read(learningPath(f), f.student).expect(200);
  await read(playbackPath(f), f.student).expect(200);
  await read(pdfPath(f), f.student).expect(200);
  const completed = await progress(f).expect(200);
  assert.equal(completed.body.data.progress.percentage, 100);
  await request(app).put(`${learningPath(f)}/last-lesson`).auth(f.student.token, { type: 'bearer' })
    .send({ lessonId: f.lesson.id }).expect(200);
  assert.equal(String((await Enrollment.findOne()).lastLessonId), f.lesson.id);
  assert.equal(videoCalls, 1); assert.equal(pdfCalls, 1);
  const ownerList = await read('/api/v1/instructor/courses?status=archived', f.owner).expect(200);
  assert.equal(ownerList.body.data.courses[0].status, 'archived');
  const adminList = await read('/api/v1/admin/courses?status=archived', f.admin).expect(200);
  assert.equal(adminList.body.data.courses[0].revision, 1);
  const owner = await read(`/api/v1/instructor/courses/${f.course.id}`, f.owner).expect(200);
  assert.equal(JSON.stringify(owner.body).includes(reason), false);
  const admin = await read(policyPath(f), f.admin).expect(200);
  assert.equal(admin.body.data.course.archiveReason, reason);
});

test('legal block prevents new access for enrolled students and reviewers without leaking reasons or changing enrollment', async () => {
  const f = await fixture();
  await progress(f).expect(200);
  await access(f).expect(200);
  for (const actor of [f.student, f.owner, f.admin]) {
    for (const path of [playbackPath(f), pdfPath(f)]) {
      const result = await read(path, actor).expect(409);
      assert.equal(result.body.error.code, 'COURSE_ACCESS_BLOCKED');
      assert.equal(JSON.stringify(result.body).includes(reason), false);
    }
  }
  await read(playbackPath(f)).expect(404);
  await read(`/api/v1/courses/${f.course.slug}`).expect(404);
  assert.deepEqual((await read('/api/v1/courses').expect(200)).body.data.courses, []);
  const detail = await read(learningPath(f), f.student).expect(409);
  assert.equal(detail.body.error.code, 'COURSE_ACCESS_BLOCKED');
  await progress(f, false).expect(409);
  const list = await read('/api/v1/users/me/courses', f.student).expect(200);
  assert.equal(list.body.data.courses[0].available, false);
  assert.equal(list.body.data.courses[0].availabilityCode, 'COURSE_ACCESS_BLOCKED');
  assert.equal(list.body.data.courses[0].course, null);
  assert.equal(list.body.data.courses[0].progress, null);
  assert.equal((await Enrollment.findOne()).status, 'active');
  assert.equal(await LessonProgress.countDocuments({ completedAt: { $ne: null } }), 1);
  assert.equal(videoCalls + pdfCalls, 0);
  const stranger = await actor();
  await request(app).post(`/api/v1/courses/${f.course.id}/checkout`).auth(stranger.token, { type: 'bearer' }).expect(404);
  await request(app).post(`/api/v1/courses/${f.course.id}/enroll`).auth(stranger.token, { type: 'bearer' }).expect(404);
  const owner = await read(`/api/v1/instructor/courses/${f.course.id}`, f.owner).expect(200);
  assert.equal(JSON.stringify(owner.body).includes(reason), false);
});

test('unblock preserves archive and unavailable markers instead of republishing or repairing content', async () => {
  const f = await fixture();
  await archive(f).expect(200); await access(f, 'blocked', 1).expect(200);
  await access(f, 'available', 2).expect(200);
  assert.equal((await Course.findById(f.course.id)).status, 'archived');
  await read(playbackPath(f), f.student).expect(200);
  await read(`/api/v1/courses/${f.course.slug}`).expect(404);
  await Course.updateOne({ _id: f.course.id }, { $set: { unavailableAt: new Date() } });
  await access(f, 'blocked', 3).expect(200); await access(f, 'available', 4).expect(200);
  await read(learningPath(f), f.student).expect(409);
  await progress(f).expect(409);
  await read(playbackPath(f), f.student).expect(404);
  assert.ok((await Course.findById(f.course.id)).unavailableAt);
});

test('matching-revision no-ops do not duplicate audit and stale revisions cannot undo newer decisions', async () => {
  const f = await fixture();
  await access(f, 'available').expect(200);
  assert.equal(await AdminAuditEvent.countDocuments(), 0);
  await archive(f).expect(200);
  await archive(f, 1).expect(200);
  await archive(f, 0).expect(409);
  await access(f, 'blocked', 0).expect(409);
  assert.equal(await AdminAuditEvent.countDocuments(), 1);
  const audit = await AdminAuditEvent.findOne();
  assert.equal(audit.action, 'course.archived');
  assert.equal(audit.fromStatus, 'published'); assert.equal(audit.toStatus, 'archived');
});

test('concurrent admins sharing a revision produce one policy decision and one audit', async () => {
  const f = await fixture(); const other = await actor(['admin']);
  const outcomes = await Promise.allSettled([
    createCourseAdministrationService().archive({ auth: f.admin.auth, courseId: f.course.id, input: { reason, expectedRevision: 0 } }),
    createCourseAdministrationService().changeAccess({ auth: other.auth, courseId: f.course.id,
      input: { accessStatus: 'blocked', reason, expectedRevision: 0 } }),
  ]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'STATE_CONFLICT');
  assert.equal(await AdminAuditEvent.countDocuments(), 1);
  assert.equal((await Course.findById(f.course.id)).policyRevision, 1);
});

test('audit failure rolls back course policy and actor/session fences with a generic error', async t => {
  const f = await fixture();
  const failure = t.mock.method(AdminAuditEvent, 'insertMany', async () => { throw new Error('private legal provider details'); });
  try {
    const result = await archive(f).expect(500);
    assert.equal(result.body.error.code, 'INTERNAL_SERVER_ERROR');
    assert.equal(JSON.stringify(result.body).includes('private legal'), false);
  } finally { failure.mock.restore(); }
  const course = await Course.findById(f.course.id);
  assert.equal(course.status, 'published'); assert.equal(course.policyRevision, 0);
  assert.equal((await User.findById(f.admin.user.id).select('+adminActionRevision')).adminActionRevision, 0);
  assert.equal(await AdminAuditEvent.countDocuments(), 0);
});

test('fresh actor/session fencing rejects suspended, demoted or logged-out admins after middleware admission', async () => {
  const f = await fixture();
  const command = () => createCourseAdministrationService().archive({ auth: f.admin.auth, courseId: f.course.id,
    input: { reason, expectedRevision: 0 } });
  await User.updateOne({ _id: f.admin.user.id }, { $set: { roles: ['student'] } });
  await assert.rejects(command(), { code: 'INSUFFICIENT_PERMISSIONS' });
  await User.updateOne({ _id: f.admin.user.id }, { $set: { roles: ['admin'], status: 'suspended' } });
  await assert.rejects(command(), { code: 'AUTHENTICATION_REQUIRED' });
  await User.updateOne({ _id: f.admin.user.id }, { $set: { status: 'active' } });
  await RefreshSession.updateOne({ familyId: f.admin.auth.familyId }, { $set: { revokedAt: new Date() } });
  await assert.rejects(command(), { code: 'AUTHENTICATION_REQUIRED' });
  assert.equal((await Course.findById(f.course.id)).status, 'published');
});

test('post-provider rechecks withhold credentials when archive or block happens during signing', async () => {
  const f = await fixture();
  videoHook = async () => { await createCourseAdministrationService().archive({ auth: f.admin.auth,
    courseId: f.course.id, input: { reason, expectedRevision: 0 } }); };
  await read(playbackPath(f)).expect(404);
  videoHook = undefined;
  await read(playbackPath(f), f.student).expect(200);
  pdfHook = async () => { await createCourseAdministrationService().changeAccess({ auth: f.admin.auth,
    courseId: f.course.id, input: { accessStatus: 'blocked', reason, expectedRevision: 1 } }); };
  const blocked = await read(pdfPath(f), f.student).expect(409);
  assert.equal(blocked.body.error.code, 'COURSE_ACCESS_BLOCKED');
  assert.equal(JSON.stringify(blocked.body).includes('private-pdf'), false);
});

test('an admitted checkout reservation survives later archive while all new reservations are denied', async () => {
  const f = await fixture({ enrolled: false });
  const checkout = createCheckoutService({ provider: paymentProvider });
  paymentHook = async () => { await createCourseAdministrationService().archive({ auth: f.admin.auth,
    courseId: f.course.id, input: { reason, expectedRevision: 0 } }); };
  try {
    const result = await checkout.checkout({ studentId: f.student.user.id, courseId: f.course.id });
    assert.equal(result.created, true);
    assert.equal(await Order.countDocuments(), 1);
    assert.equal((await Course.findById(f.course.id)).status, 'archived');
    await assert.rejects(checkout.checkout({ studentId: f.student.user.id, courseId: f.course.id }), { code: 'COURSE_NOT_FOUND' });
    assert.equal(paymentCalls, 1);
  } finally { await checkout.stop(); }
});

test('simultaneous archive and checkout serialize on the course without a post-archive reservation', async () => {
  const f = await fixture({ enrolled: false });
  const checkout = createCheckoutService({ provider: paymentProvider });
  try {
    const results = await Promise.allSettled([
      checkout.checkout({ studentId: f.student.user.id, courseId: f.course.id }),
      createCourseAdministrationService().archive({ auth: f.admin.auth, courseId: f.course.id,
        input: { reason, expectedRevision: 0 } }),
    ]);
    assert.equal(results[1].status, 'fulfilled');
    if (results[0].status === 'rejected') {
      assert.equal(results[0].reason.code, 'COURSE_NOT_FOUND');
      assert.equal(await Order.countDocuments(), 0); assert.equal(paymentCalls, 0);
    } else { assert.equal(await Order.countDocuments(), 1); }
    await assert.rejects(checkout.checkout({ studentId: f.student.user.id, courseId: f.course.id }), { code: 'COURSE_NOT_FOUND' });
  } finally { await checkout.stop(); }
});

test('archived video failure keeps the archive fence and prevents reopening or implicit learner restoration', async () => {
  const f = await fixture(); await archive(f).expect(200);
  await createVideoService({ videoProvider }).markAssetUnavailable('policy-video-asset');
  const stored = await Course.findById(f.course.id);
  assert.equal(stored.status, 'archived'); assert.ok(stored.unavailableAt);
  assert.equal((await Lesson.findById(f.lesson.id)).videoStatus, 'failed');
  assert.equal(await AdminAuditEvent.countDocuments({ action: 'course.media_unavailable', actorType: 'system' }), 1);
  await read(learningPath(f), f.student).expect(409);
  await request(app).post(`/api/v1/instructor/courses/${f.course.id}/reopen`).auth(f.owner.token, { type: 'bearer' }).expect(409);
  await access(f, 'blocked', 1).expect(200); await access(f, 'available', 2).expect(200);
  await read(learningPath(f), f.student).expect(409);
});

test('archived entitlements do not bypass suspended users, revoked enrollments or non-owner review permissions', async () => {
  const f = await fixture(); await archive(f).expect(200);
  await read(playbackPath(f), f.owner).expect(200); await read(pdfPath(f), f.admin).expect(200);
  const unrelated = await actor(['instructor']);
  await read(playbackPath(f), unrelated).expect(404);
  await Enrollment.updateOne({ studentId: f.student.user.id }, { $set: { status: 'revoked' } });
  await read(playbackPath(f), f.student).expect(404);
  await read(pdfPath(f), f.student).expect(404);
  await User.updateOne({ _id: f.student.user.id }, { $set: { status: 'suspended' } });
  await read(learningPath(f), f.student).expect(401);
  await read(playbackPath(f), f.student).expect(401);
});

test('archive does not accept pre-publication states, and block cannot be bypassed by submission or approval', async () => {
  const f = await fixture({ status: 'draft' });
  await archive(f).expect(409);
  await access(f).expect(200);
  const submit = await request(app).post(`/api/v1/instructor/courses/${f.course.id}/submit-review`)
    .auth(f.owner.token, { type: 'bearer' }).expect(409);
  assert.equal(submit.body.error.code, 'COURSE_ACCESS_BLOCKED');
  await Course.updateOne({ _id: f.course.id }, { $set: { status: 'pending_review', submittedContentRevision: 0 } });
  const review = await request(app).patch(`${policyPath(f)}/review`).auth(f.admin.token, { type: 'bearer' })
    .send({ decision: 'approve' }).expect(409);
  assert.equal(review.body.error.code, 'COURSE_ACCESS_BLOCKED');
});

test('legacy defaults, missing targets, invalid clocks and exhausted policy revisions fail safely', async () => {
  const f = await fixture();
  await Course.collection.updateOne({ _id: f.course._id }, { $unset: { accessStatus: '', policyRevision: '' } });
  await read(playbackPath(f), f.student).expect(200);
  await archive(f).expect(200);
  const input = { reason, expectedRevision: 0 };
  await assert.rejects(createCourseAdministrationService().archive({ auth: f.admin.auth,
    courseId: String(new mongoose.Types.ObjectId()), input }), { code: 'COURSE_NOT_FOUND' });
  await assert.rejects(createCourseAdministrationService({ clock: () => new Date(NaN) }).archive({
    auth: f.admin.auth, courseId: f.course.id, input }), TypeError);
  await Course.updateOne({ _id: f.course.id }, { $set: { policyRevision: Number.MAX_SAFE_INTEGER } });
  await assert.rejects(createCourseAdministrationService().changeAccess({ auth: f.admin.auth, courseId: f.course.id,
    input: { accessStatus: 'blocked', reason, expectedRevision: Number.MAX_SAFE_INTEGER } }), { code: 'COURSE_POLICY_REQUIRES_REVIEW' });
});

test('archiving an already unavailable course preserves the media failure instead of granting learning access', async () => {
  const f = await fixture({ status: 'unavailable' });
  const before = f.course.unavailableAt.getTime();
  await archive(f).expect(200);
  const stored = await Course.findById(f.course.id);
  assert.equal(stored.status, 'archived');
  assert.equal(stored.unavailableAt.getTime(), before);
  await read(learningPath(f), f.student).expect(409);
  const list = await read('/api/v1/users/me/courses', f.student).expect(200);
  assert.equal(list.body.data.courses[0].availabilityCode, 'COURSE_UNAVAILABLE');
  assert.equal(list.body.data.courses[0].course, null);
});

test('free enrollment and archive serialize with no new entitlement after archival commits', async () => {
  const f = await fixture({ enrolled: false, priceMinor: 0 });
  const [enroll, archived] = await Promise.all([
    request(app).post(`/api/v1/courses/${f.course.id}/enroll`).auth(f.student.token, { type: 'bearer' }),
    archive(f),
  ]);
  assert.equal(archived.status, 200);
  assert.ok([201, 404].includes(enroll.status));
  assert.equal(await Enrollment.countDocuments(), enroll.status === 201 ? 1 : 0);
  if (enroll.status === 201) await read(learningPath(f), f.student).expect(200);
  const other = await actor();
  await request(app).post(`/api/v1/courses/${f.course.id}/enroll`).auth(other.token, { type: 'bearer' }).expect(404);
  assert.equal(await Order.countDocuments(), 0); assert.equal(await Payment.countDocuments(), 0);
});

test('one course policy quota spans archive and access mutations and storage failure causes no writes', async () => {
  const f = await fixture();
  let hits = 0;
  let failStore = false;
  app = newApp({ rateLimitStoreFactory: namespace => {
    if (namespace !== 'admin-course-policy') return undefined;
    return { localKeys: true, async increment(key) {
      assert.equal(key, f.admin.user.id);
      if (failStore) throw new Error('private quota storage error');
      return { totalHits: ++hits === 1 ? 1 : 10000, resetTime: new Date(Date.now() + 60_000) };
    }, async decrement() {}, async resetKey() {} };
  } });
  await access(f, 'available', 0).expect(200);
  const limited = await archive(f).expect(429);
  assert.ok(limited.headers['retry-after']);
  assert.equal(limited.headers['cache-control'], 'no-store');
  failStore = true;
  const failure = await access(f).expect(503);
  assert.equal(failure.body.error.code, 'RATE_LIMIT_UNAVAILABLE');
  assert.equal((await Course.findById(f.course.id)).status, 'published');
  assert.equal(await AdminAuditEvent.countDocuments(), 0);
});

test('published text corrections guard content revision, preserve slug and audit one winning writer', async () => {
  const f = await fixture();
  const path = policyPath(f) + '/corrections';
  const correct = (actor, fields) => request(app).patch(path).auth(actor.token, { type: 'bearer' })
    .send({ expectedRevision: 0, reason, ...fields });
  await correct(f.owner, { title: 'Corrected title' }).expect(403);
  await correct(f.admin, { priceMinor: 0, title: 'Invalid change' }).expect(400);
  await correct(f.admin, {}).expect(400);
  const edits = await Promise.all(['Corrected title one', 'Corrected title two']
    .map(title => correct(f.admin, { title })));
  assert.deepEqual(edits.map(r => r.status).sort(), [200, 409]);
  const winner = edits.find(r => r.status === 200).body.data.course;
  assert.equal(winner.contentRevision, 1);
  assert.equal(winner.shortDescription, f.course.shortDescription);
  const stored = await Course.findById(f.course.id).select('+titleSearch');
  assert.equal(stored.title, winner.title);
  assert.equal(stored.slug, f.course.slug);
  assert.equal(stored.titleSearch, winner.title.toLowerCase());
  assert.equal(await AdminAuditEvent.countDocuments({ action: 'course.corrected', targetId: f.course.id,
    actorId: f.admin.user.id, reason }), 1);
  const detail = await read(policyPath(f), f.admin).expect(200);
  assert.equal(detail.body.data.course.contentRevision, 1);
});

test('candidate creation, concurrent metadata edits and logical curriculum IDs stay isolated', async () => {
  const f = await fixture();
  const root = '/api/v1/instructor/courses/' + f.course.id + '/revisions';
  const call = (method, path, body, actor = f.owner) => request(app)[method](path)
    .auth(actor.token, { type: 'bearer' }).send(body);
  const other = await actor(['student', 'instructor']);
  await call('post', root, {}, other).expect(404);
  const created = await Promise.all([call('post', root, {}), call('post', root, {})]);
  assert.deepEqual(created.map(r => r.status).sort(), [201, 409]);
  const revisionId = created.find(r => r.status === 201).body.data.id;
  const path = root + '/' + revisionId;
  const detail = await read('/api/v1/instructor/courses/' + f.course.id, f.owner).expect(200);
  assert.equal(detail.body.data.course.activeRevisionId, revisionId);
  await call('patch', path, { expectedRevision: 0, categoryId: new mongoose.Types.ObjectId().toString() }).expect(400);
  const edits = await Promise.all([100, 200].map(priceMinor => call('patch', path, { expectedRevision: 0, priceMinor })));
  assert.deepEqual(edits.map(r => r.status).sort(), [200, 409]);
  const lessons = path + '/sections/' + f.section.id + '/lessons';
  const listing = await call('get', lessons).expect(200);
  assert.equal(listing.body.data.items[0].logicalId, f.lesson.id);
  await call('patch', path + '/lessons/' + f.lesson.id, { expectedRevision: 1, title: 'New lesson title' }).expect(200);
  const newLesson = await call('post', lessons, { expectedRevision: 2, title: 'Another lesson' }).expect(201);
  await call('put', lessons + '/order', { expectedRevision: 3, orderedIds: [newLesson.body.data.logicalId, f.lesson.id] }).expect(200);
  assert.equal((await call('get', lessons)).body.data.items[0].logicalId, newLesson.body.data.logicalId);
  assert.equal((await Course.findById(f.course.id)).priceMinor, 1000);
  assert.equal((await Lesson.findById(f.lesson.id)).title, 'First Lesson');
  await User.updateOne({ _id: f.owner.user.id }, { status: 'suspended' });
  await call('patch', path, { expectedRevision: 4, priceMinor: 900 }).expect(401);
});

test('candidate snapshot preserves all 205 lessons, paginates and discards without deleting shared assets', async () => {
  const f = await fixture();
  const second = await Section.create({ courseId: f.course.id, title: 'Second Section', position: 1 });
  const more = Array.from({ length: 204 }, (_, i) => ({
    sectionId: i < 199 ? f.section.id : second.id, position: i < 199 ? i + 1 : i - 199, title: 'Lesson ' + i,
  }));
  await Lesson.insertMany(more);
  const root = '/api/v1/instructor/courses/' + f.course.id + '/revisions';
  const create = () => request(app).post(root).auth(f.owner.token, { type: 'bearer' }).send({});
  const first = (await create().expect(201)).body.data;
  assert.equal(await RevisionLesson.countDocuments({ revisionId: first.id }), 205);
  const path = root + '/' + first.id;
  const lessons = path + '/sections/' + f.section.id + '/lessons';
  const page = (await read(lessons, f.owner).expect(200)).body.data;
  assert.equal(page.items.length, 50);
  const next = (await read(lessons + '?after=' + page.nextAfter, f.owner).expect(200)).body.data;
  assert.equal(next.items[0].position, 50);
  await request(app).post(path + '/discard').auth(f.owner.token, { type: 'bearer' }).send({ expectedRevision: 0 }).expect(200);
  assert.equal((await MediaAsset.findById(f.asset.id)).status, 'ready');
  assert.equal((await create().expect(201)).body.data.number, 2);
});

test('candidate uploads, provider events and review credentials stay scoped to the editor', async () => {
  const f = await fixture();
  let passthrough;
  const mux = { ...videoProvider, async createDirectUpload({ attemptId }) {
    passthrough = attemptId;
    return { id: 'upload-candidate', url: 'https://example.test/upload', timeoutSeconds: 600 };
  } };
  const images = { ...mediaProvider, createSignedUpload() {
    return { expiresAt: new Date(Date.now() + 60_000), providerUploadValidUntil: new Date(Date.now() + 600_000) };
  }, async inspectUpload(asset) {
    return { public_id: asset.publicId, resource_type: 'raw', type: 'authenticated', bytes: 200, asset_id: 'candidate-pdf' };
  } };
  app = newApp({ videoProvider: mux, mediaProvider: images });
  const owner = (method, path, body) => request(app)[method](path).auth(f.owner.token, { type: 'bearer' }).send(body);
  const root = '/api/v1/instructor/courses/' + f.course.id + '/revisions';
  const row = (await owner('post', root, {}).expect(201)).body.data;
  const path = root + '/' + row.id;
  const lesson = path + '/lessons/' + f.lesson.id;
  await read(lesson + '/playback', f.owner).expect(200);
  await read(lesson + '/playback', f.student).expect(403);
  await read('/api/v1/admin/course-revisions/' + row.id + '/lessons/' + f.lesson.id + '/playback', f.admin).expect(200);
  await owner('delete', path + '/media/' + f.asset.id, { expectedRevision: 0 }).expect(200);
  const intent = (await owner('post', path + '/media/upload-intents', { expectedRevision: 1,
    purpose: 'lesson_attachment', targetId: f.lesson.id }).expect(201)).body.data;
  await owner('post', '/api/v1/media/' + intent.assetId + '/confirm', {}).expect(404);
  await owner('post', path + '/media/' + intent.assetId + '/confirm', { expectedRevision: 2 }).expect(200);
  await read(lesson + '/attachments/' + intent.assetId + '/download', f.owner).expect(200);
  await read('/api/v1/lessons/' + f.lesson.id + '/attachments/' + intent.assetId + '/download', f.student).expect(404);
  await owner('post', lesson + '/video-upload', { expectedRevision: 3 }).expect(201);
  const video = createVideoService({ videoProvider: { unwrapWebhook: () => ({
    type: 'video.asset.ready', data: { id: 'candidate-asset', duration: 60, passthrough },
  }) } });
  assert.equal((await video.handleWebhook({})).handled, true);
  assert.equal((await video.handleWebhook({})).handled, true);
  assert.equal((await RevisionLesson.findOne({ revisionId: row.id }).select('+videoAssetId')).videoAssetId, 'candidate-asset');
  assert.equal((await Lesson.findById(f.lesson.id).select('+videoAssetId')).videoAssetId, 'policy-video-asset');
  await owner('post', path + '/discard', { expectedRevision: 5 }).expect(200);
  assert.equal((await MediaAsset.findById(f.asset.id)).status, 'ready');
  assert.equal((await MediaAsset.findById(intent.assetId)).status, 'deleting');
  assert.deepEqual(await VideoCleanupJob.distinct('resourceId'), ['candidate-asset']);
  await read(lesson + '/playback', f.owner).expect(404);
});

test('reopen requires a rejected active candidate and the current revision', async () => {
  const f = await fixture();
  const root = '/api/v1/instructor/courses/' + f.course.id + '/revisions';
  const post = (path, data) => request(app).post(path).auth(f.owner.token, { type: 'bearer' }).send(data);
  const id = (await post(root, {}).expect(201)).body.data.id;
  const path = root + '/' + id + '/reopen';
  await post(path, { expectedRevision: 0 }).expect(409);
  await CourseRevision.updateOne({ _id: id }, { $set: { status: 'rejected', revision: 1 } });
  await post(path, { expectedRevision: 0 }).expect(409);
  const result = (await post(path, { expectedRevision: 1 }).expect(200)).body.data;
  assert.equal(result.status, 'draft');
  assert.equal(result.revision, 2);
});

async function reviewFixture() {
  const f = await fixture();
  const cover = await MediaAsset.create({ ownerId: f.owner.user.id, purpose: 'course_cover', targetId: f.course.id,
    publicId: 'test-cover', resourceType: 'image', deliveryType: 'upload', status: 'ready',
    expiresAt: new Date(), providerUploadValidUntil: new Date() });
  await Course.updateOne({ _id: f.course.id }, { coverAssetId: cover.id });
  const root = '/api/v1/instructor/courses/' + f.course.id + '/revisions';
  const call = (method, path, body, actor = f.owner) => request(app)[method](path).auth(actor.token, { type: 'bearer' }).send(body);
  const row = (await call('post', root, {}).expect(201)).body.data;
  const editor = root + '/' + row.id;
  const review = '/api/v1/admin/course-revisions/' + row.id;
  await call('patch', editor, { priceMinor: 500, expectedRevision: 0 }).expect(200);
  await call('patch', editor + '/lessons/' + f.lesson.id, { title: 'Revised lesson', expectedRevision: 1 }).expect(200);
  await call('post', editor + '/submit', { expectedRevision: 2 }).expect(200);
  return { ...f, call, editor, review, row };
}

test('revision review freezes edits, shows the diff, publishes once and retains changed rows', async () => {
  const f = await reviewFixture();
  await f.call('patch', f.editor, { priceMinor: 900, expectedRevision: 3 }).expect(409);
  assert.equal((await Course.findById(f.course.id)).priceMinor, 1000);
  const detail = (await read(f.review, f.admin).expect(200)).body.data;
  assert.equal(detail.changes.length, 2);
  assert.equal(JSON.stringify(detail).includes('policy-video-asset'), false);
  const decision = { baseContentRevision: 0, expectedRevision: 3 };
  const results = await Promise.all([1, 2].map(() => f.call('post', f.review + '/approve', decision, f.admin)));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await Course.findById(f.course.id)).priceMinor, 500);
  assert.equal((await Lesson.findById(f.lesson.id)).title, 'Revised lesson');
  assert.equal(await RevisionBeforeImage.countDocuments({ revisionId: f.row.id }), 2);
});

test('a disabled category or corrected live base blocks approval and a rejection remains auditable', async () => {
  const f = await reviewFixture();
  const decision = { baseContentRevision: 0, expectedRevision: 3 };
  await Category.updateOne({ _id: f.course.categoryId }, { isActive: false });
  await f.call('post', f.review + '/approve', decision, f.admin).expect(409);
  await Category.updateOne({ _id: f.course.categoryId }, { isActive: true });
  await f.call('patch', policyPath(f) + '/corrections', { title: 'Current live title', reason, expectedRevision: 0 }, f.admin).expect(200);
  await f.call('post', f.review + '/approve', decision, f.admin).expect(409);
  await f.call('post', f.review + '/reject', { ...decision, reason }, f.admin).expect(200);
  assert.equal((await Course.findById(f.course.id)).priceMinor, 1000);
  assert.equal((await read(f.editor, f.owner)).body.data.rejectionReason, reason);
});

test('checkout reservations keep their accepted price across publication', async () => {
  const f = await reviewFixture();
  const buyer = await actor(), laterBuyer = await actor();
  const checkout = createCheckoutService({ provider: paymentProvider });
  try {
    paymentHook = async () => {
      paymentHook = null;
      await f.call('post', f.review + '/approve', { baseContentRevision: 0, expectedRevision: 3 }, f.admin).expect(200);
    };
    await checkout.checkout({ studentId: buyer.user.id, courseId: f.course.id });
    await checkout.checkout({ studentId: laterBuyer.user.id, courseId: f.course.id });
    assert.equal((await Order.findOne({ studentId: buyer.user.id })).amountMinor, 1000);
    assert.equal((await Order.findOne({ studentId: laterBuyer.user.id })).amountMinor, 500);
  } finally { await checkout.stop(); }
});

test('replacing a completed lesson retains its history and computes completion against the new lesson', async () => {
  const f = await reviewFixture();
  await progress(f).expect(200);
  await f.call('post', f.review + '/reject', { baseContentRevision: 0, expectedRevision: 3, reason }, f.admin).expect(200);
  await f.call('post', f.editor + '/reopen', { expectedRevision: 4 }).expect(200);
  await f.call('delete', f.editor + '/lessons/' + f.lesson.id, { expectedRevision: 5 }).expect(200);
  const added = (await f.call('post', f.editor + '/sections/' + f.section.id + '/lessons',
    { expectedRevision: 6, title: 'Replacement lesson' }).expect(201)).body.data.logicalId;
  const attempt = randomUUID();
  await RevisionLesson.updateOne({ revisionId: f.row.id, logicalId: added },
    { videoAssetId: 'replacement-ready', videoStatus: 'ready', videoUploadAttemptId: attempt });
  await f.call('post', f.editor + '/submit', { expectedRevision: 7 }).expect(200);
  await f.call('post', f.review + '/approve', { baseContentRevision: 0, expectedRevision: 8 }, f.admin).expect(200);
  assert.equal(await Lesson.countDocuments({ _id: f.lesson.id }), 0);
  assert.equal(await LessonProgress.countDocuments({ lessonId: f.lesson.id }), 1);
  const outline = (await read(learningPath(f), f.student).expect(200)).body.data;
  assert.equal(outline.progress.completedAt, null);
  assert.equal(outline.progress.completedLessons, 0);
  assert.equal(outline.progress.totalLessons, 1);
  const video = createVideoService({ videoProvider: { unwrapWebhook: () => ({
    type: 'video.asset.deleted', data: { id: 'replacement-ready', passthrough: attempt },
  }) } });
  assert.equal((await video.handleWebhook({})).handled, true);
  assert.equal((await Course.findById(f.course.id)).status, 'unavailable');
});

test('archiving or losing video readiness during review prevents approval', async () => {
  const f = await reviewFixture();
  const service = createVideoService({ videoProvider: {} });
  await service.markAssetUnavailable('policy-video-asset');
  const revision = await CourseRevision.findById(f.row.id);
  await f.call('post', f.review + '/approve', { baseContentRevision: 0, expectedRevision: revision.revision }, f.admin).expect(409);
  await archive(f).expect(200);
  await f.call('post', f.review + '/approve', { baseContentRevision: 0, expectedRevision: revision.revision }, f.admin).expect(409);
  assert.equal(await RevisionBeforeImage.countDocuments(), 0);
  assert.equal((await Course.findById(f.course.id)).priceMinor, 1000);
});

test('publication rolls back earlier writes when a later before-image cannot be inserted', async () => {
  const f = await reviewFixture();
  await RevisionBeforeImage.create({ revisionId: f.row.id, logicalId: f.lesson.id, kind: 'lesson',
    before: { title: 'Already retained' } });
  await f.call('post', f.review + '/approve', { expectedRevision: 3, baseContentRevision: 0 }, f.admin).expect(409);
  assert.equal(await RevisionBeforeImage.countDocuments({ kind: 'course' }), 0);
  assert.equal((await CourseRevision.findById(f.row.id)).status, 'pending_review');
  assert.equal((await Course.findById(f.course.id)).priceMinor, 1000);
  assert.equal((await Lesson.findById(f.lesson.id)).title, 'First Lesson');
});

test('publication budget counts changed rows across sections and commits the 250-row boundary', async () => {
  const f = await reviewFixture();
  // Extend the fixture with ready live/candidate pairs before the budget probe.
  const section = await Section.create({ courseId: f.course.id, position: 1, title: 'Second section' });
  await RevisionSection.create({ revisionId: f.row.id, logicalId: section._id, position: 1, title: section.title });
  const records = Array.from({ length: 249 }, (_, index) => ({
    sectionId: index < 150 ? f.section._id : section._id, title: 'Live lesson', position: index + 1,
    videoStatus: 'ready', videoAssetId: 'budget-' + index,
  }));
  const live = await Lesson.insertMany(records);
  await RevisionLesson.insertMany(live.map((item, i) => ({ ...records[i], revisionId: f.row.id,
    logicalId: item._id, title: 'Edited lesson' })));
  const decision = { expectedRevision: 3, baseContentRevision: 0 };
  const denied = await f.call('post', f.review + '/approve', decision, f.admin).expect(409);
  assert.equal(denied.body.error.code, 'REVISION_TOO_LARGE');
  await RevisionLesson.updateOne({ revisionId: f.row.id, logicalId: live[0]._id }, { title: 'Live lesson' });
  await f.call('post', f.review + '/approve', decision, f.admin).expect(200);
  assert.equal(await RevisionBeforeImage.countDocuments({ revisionId: f.row.id }), 250);
  assert.equal(await Lesson.countDocuments({ title: 'Edited lesson' }), 248);
});
