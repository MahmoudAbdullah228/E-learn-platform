import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, beforeEach, mock, test } from 'node:test';

import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { Course } from '../src/models/Course.js';
import { Lesson } from '../src/models/Lesson.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { Section } from '../src/models/Section.js';
import { User } from '../src/models/User.js';
import { VideoAssetState } from '../src/models/VideoAssetState.js';
import { VideoCleanupJob } from '../src/models/VideoCleanupJob.js';
import { createSessionService } from '../src/modules/auth/session.service.js';
import { createMuxVideoProvider } from '../src/services/muxVideo.service.js';
import { ApiError } from '../src/utils/ApiError.js';

const password = 'correct horse battery staple';
let databaseReady = false;

before(async () => {
  await connectDatabase({ maxRetries: 1 });
  assert.match(mongoose.connection.name, /_test$/);
  await Promise.all([
    User.init(), RefreshSession.init(), Course.init(), Section.init(), Lesson.init(),
    VideoAssetState.init(), VideoCleanupJob.init(),
  ]);
  databaseReady = true;
});

beforeEach(async () => {
  await Promise.all([
    VideoAssetState.deleteMany({}), VideoCleanupJob.deleteMany({}),
    Lesson.deleteMany({}), Section.deleteMany({}), Course.deleteMany({}),
    RefreshSession.deleteMany({}), User.deleteMany({}),
  ]);
});

after(async () => {
  try {
    if (databaseReady && mongoose.connection.readyState === 1) {
      await Promise.all([
        VideoAssetState.deleteMany({}), VideoCleanupJob.deleteMany({}),
        Lesson.deleteMany({}), Section.deleteMany({}), Course.deleteMany({}),
        RefreshSession.deleteMany({}), User.deleteMany({}),
      ]);
    }
  } finally {
    await disconnectDatabase();
  }
});

async function instructor(email) {
  const user = await User.create({
    name: 'Video Instructor', email, passwordHash: await bcrypt.hash(password, 10),
    roles: ['student', 'instructor'], instructorStatus: 'approved', emailVerifiedAt: new Date(),
  });
  const session = await createSessionService().login({ email, password });
  return { user, token: session.accessToken };
}

async function curriculum(instructorId, courseOverrides = {}) {
  const course = await Course.create({
    instructorId, categoryId: new mongoose.Types.ObjectId(), title: 'Mux Video Course',
    slug: `mux-course-${new mongoose.Types.ObjectId()}`,
    description: 'A sufficiently detailed course description for Mux integration tests.',
    priceMinor: 50000, status: 'draft', ...courseOverrides,
  });
  const section = await Section.create({ courseId: course.id, title: 'Video section', position: 0 });
  const lesson = await Lesson.create({ sectionId: section.id, title: 'Video lesson', position: 0 });
  return { course, section, lesson };
}

function fakeProvider(overrides = {}) {
  let sequence = 0;
  const calls = [];
  const cancelled = [];
  return {
    calls,
    cancelled,
    async createDirectUpload(input) {
      calls.push(input);
      sequence += 1;
      return {
        id: `upload-${sequence}`,
        url: `https://storage.example.test/upload-${sequence}`,
        timeoutSeconds: 3600,
      };
    },
    async cancelDirectUpload(uploadId) {
      if (uploadId) cancelled.push(uploadId);
    },
    async unwrapWebhook({ rawBody }) {
      assert.ok(Buffer.isBuffer(rawBody));
      return JSON.parse(rawBody.toString('utf8'));
    },
    ...overrides,
  };
}

const postUpload = (app, lessonId, token) => request(app)
  .post(`/api/v1/instructor/lessons/${lessonId}/video-upload`)
  .auth(token, { type: 'bearer' }).send({});

const postWebhook = (app, event) => request(app).post('/api/v1/webhooks/video')
  .set('Content-Type', 'application/json').send(JSON.stringify(event));

test('video upload creation is owner-scoped, draft-only, and never accepts video bytes', async () => {
  const owner = await instructor('video-owner@example.com');
  const stranger = await instructor('video-stranger@example.com');
  const { lesson } = await curriculum(owner.user.id);
  const provider = fakeProvider();
  const app = createApp({ videoProvider: provider });

  await request(app).post(`/api/v1/instructor/lessons/${lesson.id}/video-upload`)
    .send({}).expect(401);
  const denied = await postUpload(app, lesson.id, stranger.token);
  assert.equal(denied.status, 404);
  assert.equal(denied.body.error.code, 'CURRICULUM_NOT_FOUND');
  assert.equal(provider.calls.length, 0);

  const bytesRejected = await request(app)
    .post(`/api/v1/instructor/lessons/${lesson.id}/video-upload`)
    .auth(owner.token, { type: 'bearer' }).send({ file: 'base64-video-data' });
  assert.equal(bytesRejected.status, 400);
  assert.equal(bytesRejected.body.error.code, 'VALIDATION_ERROR');
  assert.equal(provider.calls.length, 0);

  const response = await postUpload(app, lesson.id, owner.token);
  assert.equal(response.status, 201);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.body.data.upload.url, 'https://storage.example.test/upload-1');
  assert.equal(response.body.data.upload.videoStatus, 'pending');
  assert.deepEqual(Object.keys(response.body.data.upload).sort(),
    ['id', 'timeoutSeconds', 'url', 'videoStatus'].sort());
});

test('concurrent upload requests reserve a single attempt and reject replacement while active', async () => {
  const owner = await instructor('video-concurrent@example.com');
  const { lesson } = await curriculum(owner.user.id);
  const provider = fakeProvider();
  const app = createApp({ videoProvider: provider });
  const responses = await Promise.all([
    postUpload(app, lesson.id, owner.token), postUpload(app, lesson.id, owner.token),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  assert.equal(responses.find(response => response.status === 409).body.error.code,
    'VIDEO_UPLOAD_IN_PROGRESS');
  assert.equal(provider.calls.length, 1);
  const stored = await Lesson.findById(lesson.id)
    .select('+videoUploadAttemptId +videoUploadId').lean();
  assert.equal(stored.videoStatus, 'pending');
  assert.equal(stored.videoUploadId, 'upload-1');
  assert.equal(stored.videoUploadAttemptId, provider.calls[0].attemptId);
});

test('an abandoned pending URL expires, is cancelled, and can be replaced safely', async () => {
  const owner = await instructor('video-expired-upload@example.com');
  const { lesson } = await curriculum(owner.user.id);
  const provider = fakeProvider();
  const app = createApp({ videoProvider: provider });
  await postUpload(app, lesson.id, owner.token).expect(201);
  const firstAttempt = provider.calls[0].attemptId;
  await Lesson.updateOne({ _id: lesson.id }, {
    $set: { videoUploadExpiresAt: new Date(Date.now() - 1000) },
  });

  const replacement = await postUpload(app, lesson.id, owner.token);
  assert.equal(replacement.status, 201);
  assert.deepEqual(provider.cancelled, ['upload-1']);
  assert.notEqual(provider.calls[1].attemptId, firstAttempt);
  const stored = await Lesson.findById(lesson.id)
    .select('+videoUploadAttemptId +videoUploadId').lean();
  assert.equal(stored.videoUploadId, 'upload-2');
  assert.equal(stored.videoUploadAttemptId, provider.calls[1].attemptId);
});

test('provider failure is sanitized, marks the attempt failed, and permits retry', async () => {
  const owner = await instructor('video-provider-failure@example.com');
  const { lesson } = await curriculum(owner.user.id);
  let shouldFail = true;
  const provider = fakeProvider({
    async createDirectUpload(input) {
      this.calls.push(input);
      if (shouldFail) throw new ApiError(503, 'VIDEO_PROVIDER_UNAVAILABLE',
        'Video uploads are temporarily unavailable');
      return { id: 'retry-upload', url: 'https://storage.example.test/retry', timeoutSeconds: 60 };
    },
  });
  const app = createApp({ videoProvider: provider });
  const failed = await postUpload(app, lesson.id, owner.token);
  assert.equal(failed.status, 503);
  assert.deepEqual(failed.body, {
    error: { code: 'VIDEO_PROVIDER_UNAVAILABLE',
      message: 'Video uploads are temporarily unavailable', details: [] },
  });
  assert.equal((await Lesson.findById(lesson.id).lean()).videoStatus, 'failed');
  shouldFail = false;
  await postUpload(app, lesson.id, owner.token).expect(201);
});

test('database failure after Mux allocation cancels the URL and permits immediate retry', async () => {
  const owner = await instructor('video-database-failure@example.com');
  const { lesson } = await curriculum(owner.user.id);
  const provider = fakeProvider();
  const app = createApp({ videoProvider: provider });
  const updateOne = Lesson.updateOne;
  let failOnce = true;
  mock.method(Lesson, 'updateOne', function mockedUpdateOne(...args) {
    if (failOnce) {
      failOnce = false;
      return Promise.reject(new Error('simulated database write failure'));
    }
    return updateOne.apply(this, args);
  });
  try {
    const failed = await postUpload(app, lesson.id, owner.token);
    assert.equal(failed.status, 500);
    assert.equal(failed.body.error.code, 'INTERNAL_SERVER_ERROR');
    assert.deepEqual(provider.cancelled, ['upload-1']);
    assert.equal((await Lesson.findById(lesson.id).lean()).videoStatus, 'failed');
    await postUpload(app, lesson.id, owner.token).expect(201);
  } finally {
    mock.restoreAll();
  }
});

test('signed webhook lifecycle is idempotent and never regresses a ready lesson', async () => {
  const owner = await instructor('video-webhook@example.com');
  const { lesson } = await curriculum(owner.user.id);
  const provider = fakeProvider();
  const app = createApp({ videoProvider: provider });
  await postUpload(app, lesson.id, owner.token).expect(201);
  const attemptId = provider.calls[0].attemptId;

  const created = {
    id: 'event-created', type: 'video.asset.created',
    data: { id: 'asset-1', passthrough: attemptId },
  };
  assert.equal((await postWebhook(app, created)).body.data.handled, true);
  assert.equal((await Lesson.findById(lesson.id).lean()).videoStatus, 'processing');

  const ready = {
    id: 'event-ready', type: 'video.asset.ready',
    data: { id: 'asset-1', passthrough: attemptId, duration: 91.2 },
  };
  await postWebhook(app, ready).expect(200);
  await postWebhook(app, ready).expect(200);
  let stored = await Lesson.findById(lesson.id).select('+videoAssetId').lean();
  assert.equal(stored.videoStatus, 'ready');
  assert.equal(stored.videoAssetId, 'asset-1');
  assert.equal(stored.durationSeconds, 92);

  await postWebhook(app, created).expect(200);
  await postWebhook(app, {
    id: 'event-error', type: 'video.asset.errored',
    data: { id: 'asset-1', passthrough: attemptId },
  }).expect(200);
  stored = await Lesson.findById(lesson.id).lean();
  assert.equal(stored.videoStatus, 'ready');
});

test('webhooks from a superseded attempt cannot mutate the replacement upload', async () => {
  const owner = await instructor('video-old-event@example.com');
  const { lesson } = await curriculum(owner.user.id);
  const provider = fakeProvider();
  const app = createApp({ videoProvider: provider });
  await postUpload(app, lesson.id, owner.token).expect(201);
  const oldAttempt = provider.calls[0].attemptId;
  await postWebhook(app, {
    id: 'old-error', type: 'video.upload.errored',
    data: { new_asset_settings: { passthrough: oldAttempt } },
  }).expect(200);
  let failedAttempt = await Lesson.findById(lesson.id)
    .select('+videoUploadId +videoUploadAttemptId').lean();
  assert.equal(failedAttempt.videoStatus, 'failed');
  assert.equal(failedAttempt.videoUploadId, 'upload-1');
  await postUpload(app, lesson.id, owner.token).expect(201);
  assert.deepEqual(await VideoCleanupJob.find()
    .select('resourceType resourceId -_id').lean(), [
    { resourceType: 'upload', resourceId: 'upload-1' },
  ]);

  const oldReady = await postWebhook(app, {
    id: 'late-old-ready', type: 'video.asset.ready',
    data: { id: 'old-asset', passthrough: oldAttempt, duration: 15 },
  });
  assert.equal(oldReady.body.data.handled, false);
  const stored = await Lesson.findById(lesson.id)
    .select('+videoUploadAttemptId +videoAssetId').lean();
  assert.equal(stored.videoUploadAttemptId, provider.calls[1].attemptId);
  assert.equal(stored.videoAssetId, null);
  assert.equal(stored.videoStatus, 'pending');
});

test('asset deletion and ready delivery races always finish failed and permit replacement', async () => {
  const owner = await instructor('video-webhook-race@example.com');
  const { lesson } = await curriculum(owner.user.id);
  const provider = fakeProvider();
  const app = createApp({ videoProvider: provider });
  await postUpload(app, lesson.id, owner.token).expect(201);
  const attemptId = provider.calls[0].attemptId;
  const [deleted, ready] = await Promise.all([
    postWebhook(app, {
      id: 'deleted-race', type: 'video.asset.deleted', data: { id: 'race-asset' },
    }),
    postWebhook(app, {
      id: 'ready-race', type: 'video.asset.ready',
      data: { id: 'race-asset', passthrough: attemptId, duration: 12 },
    }),
  ]);
  assert.equal(deleted.status, 200);
  assert.equal(ready.status, 200);
  const stored = await Lesson.findById(lesson.id)
    .select('+videoUploadId +videoAssetId').lean();
  assert.equal(stored.videoStatus, 'failed');
  assert.equal(stored.videoUploadId, null);
  assert.equal(stored.videoAssetId, null);
  assert.ok((await VideoAssetState.findById('race-asset').lean()).deletedAt instanceof Date);
  await postUpload(app, lesson.id, owner.token).expect(201);
});

test('asset deletion marks the current lesson failed and allows a replacement upload', async () => {
  const owner = await instructor('video-deleted-asset@example.com');
  const { lesson } = await curriculum(owner.user.id);
  const provider = fakeProvider();
  const app = createApp({ videoProvider: provider });
  await postUpload(app, lesson.id, owner.token).expect(201);
  const attemptId = provider.calls[0].attemptId;
  await postWebhook(app, {
    id: 'ready-before-delete', type: 'video.asset.ready',
    data: { id: 'asset-to-delete', passthrough: attemptId, duration: 20 },
  }).expect(200);
  const deleted = await postWebhook(app, {
    id: 'asset-deleted', type: 'video.asset.deleted',
    data: { id: 'asset-to-delete' },
  });
  assert.equal(deleted.body.data.handled, true);
  const stored = await Lesson.findById(lesson.id)
    .select('+videoUploadId +videoAssetId').lean();
  assert.equal(stored.videoStatus, 'failed');
  assert.equal(stored.videoUploadId, null);
  assert.equal(stored.videoAssetId, null);
  await postUpload(app, lesson.id, owner.token).expect(201);
});

test('Mux adapter sends private basic test-asset settings without exposing credentials', async () => {
  let body;
  const muxClient = {
    video: { uploads: {
      async create(input) {
        body = input;
        return { id: 'mux-upload', url: 'https://storage.mux.test/upload', timeout: 120 };
      },
      async cancel() {},
    } },
    webhooks: { async unwrap() {} },
  };
  const provider = createMuxVideoProvider({
    tokenId: 'token-id', tokenSecret: 'token-secret', webhookSecret: 'webhook-secret',
    uploadOrigin: 'https://frontend.example', uploadTimeoutSeconds: 120,
    videoQuality: 'basic', testMode: true, muxClient,
  });
  const result = await provider.createDirectUpload({
    lessonId: '507f1f77bcf86cd799439011',
    attemptId: '11111111-1111-4111-8111-111111111111',
  });
  assert.equal(result.url, 'https://storage.mux.test/upload');
  assert.deepEqual(body, {
    cors_origin: 'https://frontend.example', timeout: 120, test: true,
    new_asset_settings: {
      passthrough: '11111111-1111-4111-8111-111111111111',
      meta: { external_id: '507f1f77bcf86cd799439011' },
      video_quality: 'basic',
    },
  });
  assert.equal('playback_policies' in body.new_asset_settings, false);
  assert.equal(JSON.stringify(body).includes('token-secret'), false);
});

test('Mux adapter accepts only authentic webhooks within the five-minute window', async () => {
  const secret = 'test-webhook-signing-secret';
  const now = new Date();
  const provider = createMuxVideoProvider({
    tokenId: 'token-id', tokenSecret: 'token-secret', webhookSecret: secret,
    clock: () => now,
  });
  const rawBody = Buffer.from(JSON.stringify({ id: 'evt', type: 'unknown', data: {} }));
  const timestamp = Math.floor(now.getTime() / 1000);
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
  const event = await provider.unwrapWebhook({
    rawBody, headers: { 'mux-signature': `t=${timestamp},v1=${signature}` },
  });
  assert.equal(event.id, 'evt');

  for (const header of [
    `t=${timestamp},v1=invalid`,
    `t=${timestamp - 301},v1=${signature}`,
    `t=${timestamp + 301},v1=${signature}`,
  ]) {
    await assert.rejects(
      provider.unwrapWebhook({ rawBody, headers: { 'mux-signature': header } }),
      error => error.code === 'INVALID_VIDEO_WEBHOOK_SIGNATURE' && error.statusCode === 400,
    );
  }
});

test('Mux cleanup resolves completed uploads to assets and treats missing resources as clean', async () => {
  const deletedAssets = [];
  const cancelledUploads = [];
  const controller = new AbortController();
  const receivedSignals = [];
  const muxClient = {
    video: {
      uploads: {
        async retrieve(id, options) {
          receivedSignals.push(options.signal);
          if (id === 'missing-upload') throw Object.assign(new Error('missing'), { status: 404 });
          return id === 'completed-upload' ? { asset_id: 'created-asset' } : { status: 'waiting' };
        },
        async cancel(id, options) {
          receivedSignals.push(options.signal);
          cancelledUploads.push(id);
        },
      },
      assets: { async delete(id, options) {
        receivedSignals.push(options.signal);
        deletedAssets.push(id);
      } },
    },
    webhooks: { async unwrap() {} },
  };
  const provider = createMuxVideoProvider({
    tokenId: 'token-id', tokenSecret: 'token-secret', webhookSecret: 'webhook-secret', muxClient,
  });
  const cleanup = (resourceType, resourceId) => provider.cleanupResource({
    resourceType, resourceId, signal: controller.signal,
  });
  await cleanup('upload', 'completed-upload');
  await cleanup('upload', 'waiting-upload');
  await cleanup('upload', 'missing-upload');
  await cleanup('asset', 'direct-asset');
  assert.deepEqual(deletedAssets, ['created-asset', 'direct-asset']);
  assert.deepEqual(cancelledUploads, ['waiting-upload']);
  assert.ok(receivedSignals.every(signal => signal === controller.signal));
});

test('video webhook HTTP boundary rejects invalid signatures with the standard safe envelope', async () => {
  const provider = createMuxVideoProvider({
    tokenId: 'token-id', tokenSecret: 'token-secret', webhookSecret: 'expected-secret',
  });
  const app = createApp({ videoProvider: provider });
  const response = await request(app).post('/api/v1/webhooks/video')
    .set('Content-Type', 'application/json')
    .set('mux-signature', `t=${Math.floor(Date.now() / 1000)},v1=not-valid`)
    .send(JSON.stringify({ id: 'event', type: 'video.asset.ready', data: {} }));
  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: {
      code: 'INVALID_VIDEO_WEBHOOK_SIGNATURE',
      message: 'The video webhook signature is invalid',
      details: [],
    },
  });
  assert.equal('stack' in response.body.error, false);
});
