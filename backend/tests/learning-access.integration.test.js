import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';

import mongoose from 'mongoose';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { Category } from '../src/models/Category.js';
import { Course } from '../src/models/Course.js';
import { CourseReviewEvent } from '../src/models/CourseReviewEvent.js';
import { Enrollment } from '../src/models/Enrollment.js';
import { Lesson } from '../src/models/Lesson.js';
import { LessonProgress } from '../src/models/LessonProgress.js';
import { MediaAsset } from '../src/models/MediaAsset.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { Section } from '../src/models/Section.js';
import { User } from '../src/models/User.js';
import { VideoAssetState } from '../src/models/VideoAssetState.js';
import { VideoPlaybackLease } from '../src/models/VideoPlaybackLease.js';
import { createLearningAccessService } from '../src/modules/learningAccess/learningAccess.service.js';
import { createVideoService } from '../src/modules/video/video.service.js';
import { migrateSignedPlayback } from '../src/services/signedPlaybackMigration.service.js';
import { ApiError } from '../src/utils/ApiError.js';
import { signAccessToken } from '../src/utils/sessionToken.js';

const models = [LessonProgress, VideoPlaybackLease, VideoAssetState, CourseReviewEvent, Enrollment,
  MediaAsset, Lesson, Section, Course, Category, RefreshSession, User];
let ready = false;
let app;
let videoCalls;
let mediaCalls;
let prepareHook;
let downloadHook;
const videoProvider = {
  async ensureSignedPlaybackId(input) {
    videoCalls += 1;
    await prepareHook?.(input);
    return 'signed-playback-id';
  },
  async signPlaybackToken() {
    return { token: 'signed-video-token', expiresAt: new Date(Date.now() + 900_000) };
  },
};
const mediaProvider = {
  async createPrivateDownload() {
    mediaCalls += 1;
    await downloadHook?.();
    return { url: 'https://api.cloudinary.com/authenticated-download',
      expiresAt: new Date(Date.now() + 60_000) };
  },
};
const newApp = options => createApp({ videoProvider, mediaProvider, ...options });
before(async () => {
  await connectDatabase({ maxRetries: 1 }); assert.match(mongoose.connection.name, /_test$/);
  await Promise.all(models.map(Model => Model.init())); ready = true;
});
beforeEach(async () => {
  await Promise.all(models.map(Model => Model.deleteMany({})));
  videoCalls = 0; mediaCalls = 0; prepareHook = undefined; downloadHook = undefined; app = newApp();
});
after(async () => {
  try {
    if (ready && mongoose.connection.readyState === 1) await Promise.all(models.map(Model => Model.deleteMany({})));
  } finally { await disconnectDatabase(); }
});
async function actor(email, roles = ['student']) {
  const user = await User.create({ name: 'Learning Actor', email, roles,
    instructorStatus: roles.includes('instructor') ? 'approved' : 'none',
    passwordHash: 'unused-test-hash', emailVerifiedAt: new Date() });
  const familyId = randomUUID();
  await RefreshSession.create({ userId: user.id, familyId, tokenHash: randomUUID(),
    tokenVersion: 0, expiresAt: new Date(Date.now() + 86_400_000) });
  const auth = { userId: user.id, roles, familyId, tokenVersion: 0 };
  return { user, auth, token: await signAccessToken(auth) };
}
async function fixture({ preview = false, enrolled = true, status = 'published' } = {}) {
  const owner = await actor('learning-owner@example.test', ['student', 'instructor']);
  const student = await actor('learning-student@example.test');
  const category = await Category.create({ name: 'Learning', slug: 'learning' });
  const course = await Course.create({ instructorId: owner.user.id, categoryId: category.id,
    title: 'Learning Course', slug: 'learning-course', priceMinor: 100, status,
    description: 'Learning course description for protected content.' });
  const section = await Section.create({ courseId: course.id, title: 'First Section', position: 0 });
  const lesson = await Lesson.create({ sectionId: section.id, title: 'First Lesson', position: 0,
    videoStatus: 'ready', videoAssetId: 'private-video-asset', isPreview: preview });
  const asset = await MediaAsset.create({ ownerId: owner.user.id, purpose: 'lesson_attachment',
    targetId: lesson.id, publicId: 'elearn/lesson_attachment/private-file', resourceType: 'raw',
    deliveryType: 'authenticated', status: 'ready', format: 'pdf',
    expiresAt: new Date(Date.now() - 60_000), providerUploadValidUntil: new Date(Date.now() - 60_000),
    attachedAt: new Date(), bytes: 2048 });
  await Lesson.updateOne({ _id: lesson.id }, { $set: { attachments: [asset.id] } });
  if (enrolled) await Enrollment.create({ studentId: student.user.id, courseId: course.id, enrolledAt: new Date() });
  return { owner, student, course, section, lesson, asset };
}
const playbackPath = f => `/api/v1/lessons/${f.lesson.id}/playback`;
const downloadPath = f => `/api/v1/lessons/${f.lesson.id}/attachments/${f.asset.id}/download`;
function read(path, token, application = app) {
  const req = request(application).get(path);
  return token ? req.auth(token, { type: 'bearer' }) : req;
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('enrolled students receive only signed playback credentials and an exact expiry', async () => {
  const f = await fixture();
  const response = await read(playbackPath(f), f.student.token).expect(200);
  assert.deepEqual(Object.keys(response.body), ['data']);
  assert.deepEqual(Object.keys(response.body.data).sort(), ['expiresAt', 'playbackId', 'token']);
  assert.equal(response.body.data.playbackId, 'signed-playback-id');
  assert.ok(Date.parse(response.body.data.expiresAt) <= Date.now() + 900_000);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(JSON.stringify(response.body).includes('private-video-asset'), false);
  assert.equal(await VideoPlaybackLease.countDocuments(), 0);
});

test('only published preview videos allow anonymous access', async () => {
  const f = await fixture({ preview: true, enrolled: false });
  await read(playbackPath(f)).expect(200);
  await read(playbackPath(f), f.student.token).expect(200);
  await Course.updateOne({ _id: f.course.id }, { $set: { status: 'draft' } });
  await read(playbackPath(f)).expect(404);
  await read(playbackPath(f), f.student.token).expect(404);
  assert.equal(videoCalls, 2);
});

test('invalid or empty supplied bearer credentials never fall back to anonymous preview', async () => {
  const f = await fixture({ preview: true });
  for (const authorization of ['', 'Basic abc', 'Bearer invalid', 'Bearer a b']) {
    const res = await request(app).get(playbackPath(f)).set('Authorization', authorization).expect(401);
    assert.equal(res.headers['cache-control'], 'no-store');
  }
  assert.equal(videoCalls, 0);
});

test('unenrolled students cannot access paid video or private PDFs even on preview lessons', async () => {
  const f = await fixture({ enrolled: false });
  for (const path of [playbackPath(f), downloadPath(f)]) {
    assert.equal((await read(path, f.student.token).expect(403)).body.error.code, 'ENROLLMENT_REQUIRED');
  }
  await read(downloadPath(f)).expect(401);
  await Lesson.updateOne({ _id: f.lesson.id }, { $set: { isPreview: true } });
  await read(downloadPath(f), f.student.token).expect(403);
  assert.equal(videoCalls + mediaCalls, 0);
});

test('revoked enrollment denies video and PDFs but does not disable public preview policy', async () => {
  const f = await fixture(); await Enrollment.updateMany({}, { $set: { status: 'revoked' } });
  await read(playbackPath(f), f.student.token).expect(403);
  await read(downloadPath(f), f.student.token).expect(403);
  await Lesson.updateOne({ _id: f.lesson.id }, { $set: { isPreview: true } });
  await read(playbackPath(f), f.student.token).expect(200);
});

test('approved owner and current admin can review private course video/PDF without enrollment', async () => {
  const f = await fixture({ status: 'pending_review', enrolled: false });
  const admin = await actor('learning-admin@example.test', ['admin']);
  for (const token of [f.owner.token, admin.token]) {
    await read(playbackPath(f), token).expect(200);
    await read(downloadPath(f), token).expect(200);
  }
  await read(playbackPath(f), f.student.token).expect(404);
  assert.equal(await Enrollment.countDocuments(), 0);
});

test('former owner privileges, stale admin JWT roles and inactive sessions are not trusted', async () => {
  const f = await fixture({ status: 'draft' });
  await User.updateOne({ _id: f.owner.user.id }, { $set: { instructorStatus: 'rejected' } });
  await read(playbackPath(f), f.owner.token).expect(404);
  const admin = await actor('stale-admin@example.test', ['admin']);
  await User.updateOne({ _id: admin.user.id }, { $set: { roles: ['student'] } });
  await read(playbackPath(f), admin.token).expect(404);
  await RefreshSession.updateOne({ familyId: f.student.auth.familyId }, { $set: { revokedAt: new Date() } });
  await read(playbackPath(f), f.student.token).expect(401);
});

test('suspended or unverified users cannot use a supplied JWT for preview', async () => {
  const f = await fixture({ preview: true });
  await User.updateOne({ _id: f.student.user.id }, { $set: { status: 'suspended' } });
  await read(playbackPath(f), f.student.token).expect(401);
  await User.updateOne({ _id: f.student.user.id }, { $set: { status: 'active', emailVerifiedAt: null } });
  await read(playbackPath(f), f.student.token).expect(401);
  assert.equal(videoCalls, 0);
});

test('PDF issuance requires an exact ready authenticated lesson-owned asset', async () => {
  const f = await fixture();
  const result = await read(downloadPath(f), f.student.token).expect(200);
  assert.deepEqual(Object.keys(result.body.data).sort(), ['expiresAt', 'url']);
  assert.ok(Date.parse(result.body.data.expiresAt) <= Date.now() + 60_000);
  assert.equal(result.headers['cache-control'], 'no-store');
  // Upload-intent deadlines do not expire an already confirmed attachment.
  for (const [field, value] of Object.entries({ status: 'deleting', targetId: new mongoose.Types.ObjectId(),
    ownerId: f.student.user._id, deliveryType: 'upload', resourceType: 'image', format: 'png', purpose: 'avatar' })) {
    const original = (await MediaAsset.findById(f.asset.id).lean())[field];
    await MediaAsset.collection.updateOne({ _id: f.asset._id }, { $set: { [field]: value } });
    await read(downloadPath(f), f.student.token).expect(404);
    await MediaAsset.collection.updateOne({ _id: f.asset._id }, { $set: { [field]: original } });
  }
  await Lesson.updateOne({ _id: f.lesson.id }, { $set: { attachments: [] } });
  await read(downloadPath(f), f.student.token).expect(404);
  assert.equal(mediaCalls, 1);
});

test('student outline exposes only confirmed PDF IDs for download discovery, not provider identifiers', async () => {
  const f = await fixture();
  const response = await read(`/api/v1/users/me/courses/${f.course.id}`, f.student.token).expect(200);
  assert.deepEqual(response.body.data.course.sections[0].lessons[0].attachments, [f.asset.id]);
  assert.equal(JSON.stringify(response.body).includes(f.asset.publicId), false);
  assert.equal(JSON.stringify(response.body).includes('private-video-asset'), false);
  await MediaAsset.updateOne({ _id: f.asset.id }, { $set: { status: 'deleting' } });
  const updated = await read(`/api/v1/users/me/courses/${f.course.id}`, f.student.token).expect(200);
  assert.deepEqual(updated.body.data.course.sections[0].lessons[0].attachments, []);
});

test('video must be ready, asset-bound and not tombstoned before contacting Mux', async () => {
  const f = await fixture();
  for (const status of ['none', 'pending', 'processing', 'failed']) {
    await Lesson.updateOne({ _id: f.lesson.id }, { $set: { videoStatus: status } });
    await read(playbackPath(f), f.student.token).expect(409);
  }
  await Lesson.updateOne({ _id: f.lesson.id }, { $set: { videoStatus: 'ready' } });
  await VideoAssetState.create({ _id: 'private-video-asset', deletedAt: new Date() });
  await read(playbackPath(f), f.student.token).expect(409);
  assert.equal(videoCalls, 0);
});

test('enrollment revocation during provider preparation prevents returning the prepared token', async () => {
  const f = await fixture();
  prepareHook = async () => Enrollment.updateMany({}, { $set: { status: 'revoked' } });
  const response = await read(playbackPath(f), f.student.token).expect(403);
  assert.equal(response.body.data, undefined);
});

test('account suspension and session revocation during provider preparation reject issuance', async () => {
  const f = await fixture();
  prepareHook = async () => User.updateOne({ _id: f.student.user.id }, { $set: { status: 'suspended' } });
  await read(playbackPath(f), f.student.token).expect(401);
  await User.updateOne({ _id: f.student.user.id }, { $set: { status: 'active' } });
  prepareHook = async () => RefreshSession.updateMany({ userId: f.student.user.id }, { $set: { revokedAt: new Date() } });
  await read(playbackPath(f), f.student.token).expect(401);
});

test('unpublication during provider work rejects a previously authorized student', async () => {
  const f = await fixture();
  prepareHook = async () => Course.updateOne({ _id: f.course.id }, { $set: { status: 'unavailable' } });
  await read(playbackPath(f), f.student.token).expect(404);
});

test('replacing the bound video while Mux responds cannot return a stale playback ID', async () => {
  const f = await fixture();
  prepareHook = async () => Lesson.updateOne({ _id: f.lesson.id }, { $set: { videoAssetId: 'replacement-video' } });
  assert.equal((await read(playbackPath(f), f.student.token).expect(409)).body.error.code, 'VIDEO_STATE_CHANGED');
});

test('PDF permissions and attachment binding are checked again after URL preparation', async () => {
  const f = await fixture();
  downloadHook = async () => Enrollment.updateMany({}, { $set: { status: 'revoked' } });
  await read(downloadPath(f), f.student.token).expect(403);
  await Enrollment.updateMany({}, { $set: { status: 'active' } });
  downloadHook = async () => Lesson.updateOne({ _id: f.lesson.id }, { $set: { attachments: [] } });
  await read(downloadPath(f), f.student.token).expect(404);
});

test('cross-process asset lease serializes provider policy upgrades and releases for retry', async () => {
  const f = await fixture(); const entered = deferred(); const release = deferred();
  prepareHook = async () => { entered.resolve(); await release.promise; };
  const first = read(playbackPath(f), f.student.token).then(value => value);
  await entered.promise;
  const denied = await read(playbackPath(f), f.student.token).expect(503);
  assert.equal(denied.body.error.code, 'PLAYBACK_PREPARING');
  assert.equal(videoCalls, 1);
  release.resolve(); assert.equal((await first).status, 200);
  prepareHook = undefined;
  await read(playbackPath(f), f.student.token).expect(200);
  assert.equal(await VideoPlaybackLease.countDocuments(), 0);
});

test('expired migration leases are recoverable without TTL cleanup and stale work is fenced', async () => {
  const f = await fixture();
  await VideoPlaybackLease.create({ _id: 'private-video-asset', owner: 'dead-process', expiresAt: new Date(0) });
  prepareHook = async () => VideoPlaybackLease.updateOne({ _id: 'private-video-asset' },
    { $set: { owner: 'new-owner', expiresAt: new Date(Date.now() + 120_000) } });
  await read(playbackPath(f), f.student.token).expect(503);
  assert.equal((await VideoPlaybackLease.findById('private-video-asset')).owner, 'new-owner');
});

test('provider-missing video becomes unavailable with audit/tombstone and cannot revive on late ready', async () => {
  const f = await fixture();
  prepareHook = async () => { throw new ApiError(409, 'VIDEO_ASSET_UNAVAILABLE', 'The lesson video must be uploaded again'); };
  await read(playbackPath(f), f.student.token).expect(409);
  assert.equal((await Lesson.findById(f.lesson.id)).videoStatus, 'failed');
  assert.equal((await Course.findById(f.course.id)).status, 'unavailable');
  assert.ok((await VideoAssetState.findById('private-video-asset')).deletedAt);
  assert.equal(await CourseReviewEvent.countDocuments({ action: 'unpublished' }), 1);
});

test('shutdown cancels hung provider issuance and guards late results', async () => {
  const f = await fixture(); const entered = deferred(); const release = deferred();
  prepareHook = async () => { entered.resolve(); await release.promise; };
  const response = read(playbackPath(f), f.student.token).then(value => value);
  await entered.promise; const stopping = app.locals.learningAccessService.stop();
  assert.equal((await response).status, 503);
  await read(playbackPath(f), f.student.token).expect(503);
  release.resolve();
  await stopping;
  // An uncertain canceled remote operation retains a bounded recoverable lease.
  assert.equal(await VideoPlaybackLease.countDocuments(), 1);
});

test('provider issuance has a bounded deadline even when an injected adapter ignores cancellation', async () => {
  const f = await fixture(); const release = deferred();
  prepareHook = async () => release.promise;
  const service = createLearningAccessService({ videoProvider, mediaProvider,
    videoService: createVideoService({ videoProvider }), operationTimeoutMs: 100 });
  await assert.rejects(service.playback({ lessonId: f.lesson.id, auth: f.student.auth }),
    error => error.code === 'VIDEO_PROVIDER_UNAVAILABLE');
  release.resolve();
  await service.stop();
});

test('shutdown drain has a deadline even when a provider ignores its abort signal', async () => {
  const f = await fixture(); const entered = deferred(); const release = deferred();
  prepareHook = async () => { entered.resolve(); await release.promise; };
  const service = createLearningAccessService({ videoProvider, mediaProvider,
    videoService: createVideoService({ videoProvider }), shutdownTimeoutMs: 20 });
  const rejected = assert.rejects(service.playback({ lessonId: f.lesson.id, auth: f.student.auth }),
    error => error.code === 'VIDEO_PROVIDER_UNAVAILABLE');
  await entered.promise;
  const start = Date.now(); await service.stop();
  assert.ok(Date.now() - start < 1000); await rejected;
  release.resolve(); await service.stop();
  assert.equal(await VideoPlaybackLease.countDocuments(), 1);
});

test('shutdown during a database lookup prevents subsequent lookups or provider calls', async t => {
  const f = await fixture(); const entered = deferred(); const release = deferred();
  const original = Lesson.findById; let sectionReads = 0;
  t.mock.method(Lesson, 'findById', function (...args) {
    const query = original.apply(this, args); const exec = query.exec;
    query.exec = async function (...values) {
      const value = await exec.apply(this, values);
      entered.resolve(); await release.promise; return value;
    };
    return query;
  });
  const originalSectionRead = Section.findById;
  t.mock.method(Section, 'findById', function (...args) {
    sectionReads += 1; return originalSectionRead.apply(this, args);
  });
  const service = createLearningAccessService({ videoProvider, mediaProvider,
    videoService: createVideoService({ videoProvider }), shutdownTimeoutMs: 20 });
  const rejected = assert.rejects(service.playback({ lessonId: f.lesson.id, auth: f.student.auth }),
    error => error.code === 'VIDEO_PROVIDER_UNAVAILABLE');
  await entered.promise; await service.stop(); await rejected;
  release.resolve(); await service.stop();
  assert.equal(sectionReads, 0); assert.equal(videoCalls, 0);
});

test('one authenticated quota spans video/PDF and every lesson, independent of anonymous preview', async () => {
  const f = await fixture({ preview: true }); const hits = new Map();
  const limited = newApp({ rateLimitStoreFactory: name => name !== 'learning-access' ? undefined : {
    localKeys: true, async increment(key) {
      const totalHits = (hits.get(key) ?? env.LEARNING_ACCESS_RATE_LIMIT_MAX - 1) + 1;
      hits.set(key, totalHits); return { totalHits, resetTime: new Date(Date.now() + 60_000) };
    }, async decrement() {}, async resetKey() {},
  } });
  await read(playbackPath(f), f.student.token, limited).expect(200);
  const denied = await read(downloadPath(f), f.student.token, limited).expect(429);
  assert.equal(denied.body.error.code, 'RATE_LIMITED'); assert.ok(denied.headers['retry-after']);
  await read(`/api/v1/lessons/${new mongoose.Types.ObjectId()}/playback`, f.student.token, limited).expect(429);
  await read(playbackPath(f), undefined, limited).expect(200);
  assert.deepEqual([...hits.keys()], [f.student.user.id]); assert.equal(mediaCalls, 0);
});

test('anonymous preview limits are IP scoped across lessons and return safe Retry-After', async () => {
  const f = await fixture({ preview: true }); const keys = [];
  const limited = newApp({ rateLimitStoreFactory: name => name !== 'preview' ? undefined : {
    localKeys: true, async increment(key) {
      keys.push(key); return { totalHits: env.PREVIEW_RATE_LIMIT_MAX + keys.length - 1,
        resetTime: new Date(Date.now() + 60_000) };
    }, async decrement() {}, async resetKey() {},
  } });
  await read(playbackPath(f), undefined, limited).expect(200);
  const denied = await read(`/api/v1/lessons/${new mongoose.Types.ObjectId()}/playback`, undefined, limited).expect(429);
  assert.equal(denied.body.error.code, 'RATE_LIMITED'); assert.ok(denied.headers['retry-after']);
  assert.equal(keys[0], keys[1]);
});

test('shared-store errors fail closed with safe 503 for both preview and authenticated access', async () => {
  const f = await fixture({ preview: true });
  const failed = newApp({ rateLimitStoreFactory: name => !['preview', 'learning-access'].includes(name) ? undefined : {
    localKeys: true, async increment() { throw new Error('redis secret password'); },
    async decrement() {}, async resetKey() {},
  } });
  for (const [path, token] of [[playbackPath(f), undefined], [playbackPath(f), f.student.token],
    [downloadPath(f), f.student.token]]) {
    const response = await read(path, token, failed).expect(503);
    assert.equal(response.body.error.code, 'RATE_LIMIT_UNAVAILABLE');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(JSON.stringify(response.body).includes('secret'), false);
  }
  assert.equal(videoCalls + mediaCalls, 0);
});

test('strict params/query errors, missing content and unexpected failures remain safe and no-store', async () => {
  const f = await fixture();
  for (const path of ['/api/v1/lessons/bad/playback', `${playbackPath(f)}?token=secret`,
    `${downloadPath(f)}?publicId=foreign`]) {
    const response = await read(path, f.student.token).expect(400);
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  await read(`/api/v1/lessons/${new mongoose.Types.ObjectId()}/playback`, f.student.token).expect(404);
  prepareHook = async () => { throw new Error('provider password and stack'); };
  const error = await read(playbackPath(f), f.student.token).expect(500);
  assert.deepEqual(Object.keys(error.body.error).sort(), ['code', 'details', 'message']);
  assert.equal(JSON.stringify(error.body).includes('password'), false);
  assert.equal(error.headers['cache-control'], 'no-store');
});

test('signed playback migration is dry-run by default, resumable and safe to repeat', async () => {
  const f = await fixture(); const videoService = createVideoService({ videoProvider });
  const first = await migrateSignedPlayback({ provider: videoProvider, videoService });
  assert.equal(first.candidates, 1); assert.equal(first.nextAfter, f.lesson.id); assert.equal(videoCalls, 0);
  for (let i = 0; i < 2; i += 1) {
    const result = await migrateSignedPlayback({ provider: videoProvider, videoService, apply: true });
    assert.equal(result.secured, 1); assert.equal(result.failed, 0);
  }
  assert.equal((await migrateSignedPlayback({ provider: videoProvider, videoService, after: first.nextAfter })).candidates, 0);
  prepareHook = async () => { throw new ApiError(409, 'VIDEO_ASSET_UNAVAILABLE', 'Unavailable'); };
  const missing = await migrateSignedPlayback({ provider: videoProvider, videoService, apply: true });
  assert.equal(missing.unavailable, 1);
  assert.equal((await Lesson.findById(f.lesson.id)).videoStatus, 'failed');
});
