import assert from 'node:assert/strict';
import { after, before, beforeEach, mock, test } from 'node:test';

import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { assertTransactionSupport } from '../src/config/transactions.js';
import { Course } from '../src/models/Course.js';
import { Lesson } from '../src/models/Lesson.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { Section } from '../src/models/Section.js';
import { User } from '../src/models/User.js';
import { VideoCleanupJob } from '../src/models/VideoCleanupJob.js';
import { createSessionService } from '../src/modules/auth/session.service.js';
import { createVideoCleanupWorker } from '../src/services/videoCleanupWorker.service.js';

const cleanedVideoResources = [];
const app = createApp({
  videoProvider: {
    async cleanupResource({ resourceType, resourceId }) {
      cleanedVideoResources.push({ resourceType, resourceId });
    },
  },
});
const password = 'correct horse battery staple';
let databaseReady = false;

before(async () => {
  await connectDatabase({ maxRetries: 1 });
  assert.match(mongoose.connection.name, /_test$/);
  await assertTransactionSupport();
  await Promise.all([
    User.init(), RefreshSession.init(), Course.init(), Section.init(), Lesson.init(),
    VideoCleanupJob.init(),
  ]);
  databaseReady = true;
});

beforeEach(async () => {
  await Promise.all([
    VideoCleanupJob.deleteMany({}), Lesson.deleteMany({}), Section.deleteMany({}), Course.deleteMany({}),
    RefreshSession.deleteMany({}), User.deleteMany({}),
  ]);
  cleanedVideoResources.length = 0;
});

after(async () => {
  try {
    if (databaseReady && mongoose.connection.readyState === 1) {
      await Promise.all([
        VideoCleanupJob.deleteMany({}), Lesson.deleteMany({}),
        Section.deleteMany({}), Course.deleteMany({}),
        RefreshSession.deleteMany({}), User.deleteMany({}),
      ]);
    }
  } finally {
    await disconnectDatabase();
  }
});

async function instructor(email) {
  const user = await User.create({
    name: 'Curriculum Owner', email, passwordHash: await bcrypt.hash(password, 10),
    roles: ['student', 'instructor'], instructorStatus: 'approved', emailVerifiedAt: new Date(),
  });
  const session = await createSessionService().login({ email, password });
  return { user, token: session.accessToken };
}

function course(instructorId, overrides = {}) {
  return Course.create({
    instructorId, categoryId: new mongoose.Types.ObjectId(), title: 'Node Architecture',
    slug: `node-architecture-${new mongoose.Types.ObjectId()}`,
    description: 'A sufficiently detailed course description for curriculum integration tests.',
    priceMinor: 50000, status: 'draft', ...overrides,
  });
}

const auth = (method, path, token) => request(app)[method](path).auth(token, { type: 'bearer' });

test('curriculum endpoints require an instructor and hide foreign ownership', async () => {
  const owner = await instructor('curriculum-owner@example.com');
  const stranger = await instructor('curriculum-stranger@example.com');
  const draft = await course(owner.user.id);

  await request(app).post(`/api/v1/instructor/courses/${draft.id}/sections`)
    .send({ title: 'Introduction' }).expect(401);
  const response = await auth('post', `/api/v1/instructor/courses/${draft.id}/sections`, stranger.token)
    .send({ title: 'Introduction' });
  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, 'CURRICULUM_NOT_FOUND');
  assert.equal(await Section.countDocuments(), 0);
});

test('sections and lessons append atomically and list in position order', async () => {
  const owner = await instructor('curriculum-create@example.com');
  const draft = await course(owner.user.id);
  const sectionResponses = await Promise.all(['Foundations', 'Architecture'].map(title =>
    auth('post', `/api/v1/instructor/courses/${draft.id}/sections`, owner.token).send({ title })));
  assert.deepEqual(sectionResponses.map(response => response.status), [201, 201]);

  const sections = await Section.find({ courseId: draft.id }).sort({ position: 1 }).lean();
  assert.deepEqual(sections.map(section => section.position), [0, 1]);
  const lessonResponses = await Promise.all(['First lesson', 'Second lesson'].map(title =>
    auth('post', `/api/v1/instructor/sections/${sections[0]._id}/lessons`, owner.token)
      .send({ title, isPreview: title === 'First lesson' })));
  assert.deepEqual(lessonResponses.map(response => response.status), [201, 201]);

  const response = await auth('get', `/api/v1/instructor/courses/${draft.id}/sections`, owner.token);
  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(response.body.data.sections.map(section => section.position), [0, 1]);
  assert.deepEqual(response.body.data.sections[0].lessons.map(lesson => lesson.position), [0, 1]);
  assert.equal(response.body.data.sections[0].lessons[0].isPreview, true);
  assert.equal('videoAssetId' in response.body.data.sections[0].lessons[0], false);
});

test('reorder requires the exact current ID set and commits contiguous positions', async () => {
  const owner = await instructor('curriculum-order@example.com');
  const draft = await course(owner.user.id);
  const sections = await Section.create([
    { courseId: draft.id, title: 'One', position: 0 },
    { courseId: draft.id, title: 'Two', position: 1 },
    { courseId: draft.id, title: 'Three', position: 2 },
  ]);
  const path = `/api/v1/instructor/courses/${draft.id}/sections/order`;
  const invalid = await auth('put', path, owner.token)
    .send({ orderedIds: [sections[0].id, sections[1].id] });
  assert.equal(invalid.status, 409);
  assert.equal(invalid.body.error.code, 'INVALID_CURRICULUM_ORDER');

  const orderedIds = [sections[2].id, sections[0].id, sections[1].id];
  const valid = await auth('put', path, owner.token).send({ orderedIds });
  assert.equal(valid.status, 200);
  assert.deepEqual(valid.body.data.sections.map(section => section.id), orderedIds);
  assert.deepEqual(valid.body.data.sections.map(section => section.position), [0, 1, 2]);
});

test('lesson update/delete is owner scoped and deletion compacts sibling positions', async () => {
  const owner = await instructor('lesson-edit@example.com');
  const stranger = await instructor('lesson-stranger@example.com');
  const draft = await course(owner.user.id);
  const section = await Section.create({ courseId: draft.id, title: 'Section', position: 0 });
  const lessons = await Lesson.create([
    { sectionId: section.id, title: 'First', position: 0 },
    {
      sectionId: section.id, title: 'Second', position: 1,
      videoUploadId: 'lesson-upload', videoAssetId: 'lesson-asset', videoStatus: 'ready',
    },
    { sectionId: section.id, title: 'Third', position: 2 },
  ]);
  await auth('patch', `/api/v1/instructor/lessons/${lessons[1].id}`, stranger.token)
    .send({ title: 'Stolen edit' }).expect(404);
  const updated = await auth('patch', `/api/v1/instructor/lessons/${lessons[1].id}`, owner.token)
    .send({ title: 'Updated lesson', isPreview: true });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.lesson.title, 'Updated lesson');

  await auth('delete', `/api/v1/instructor/lessons/${lessons[1].id}`, owner.token).expect(200);
  const remaining = await Lesson.find({ sectionId: section.id }).sort({ position: 1 }).lean();
  assert.deepEqual(remaining.map(lesson => lesson.position), [0, 1]);
  assert.equal(await VideoCleanupJob.countDocuments(), 1);
  await app.locals.videoCleanupWorker.processNext();
  assert.deepEqual(cleanedVideoResources, [
    { resourceType: 'asset', resourceId: 'lesson-asset' },
  ]);
  assert.equal(await VideoCleanupJob.countDocuments(), 0);
});

test('deleting a section cascades lessons and compacts remaining sections in one transaction', async () => {
  const owner = await instructor('section-delete@example.com');
  const draft = await course(owner.user.id);
  const sections = await Section.create([
    { courseId: draft.id, title: 'First', position: 0 },
    { courseId: draft.id, title: 'Second', position: 1 },
    { courseId: draft.id, title: 'Third', position: 2 },
  ]);
  await Lesson.create({
    sectionId: sections[1].id, title: 'Child lesson', position: 0,
    videoAssetId: 'section-child-asset', videoStatus: 'ready',
  });
  await auth('delete',
    `/api/v1/instructor/courses/${draft.id}/sections/${sections[1].id}`, owner.token).expect(200);
  assert.equal(await Lesson.countDocuments({ sectionId: sections[1].id }), 0);
  assert.deepEqual(await VideoCleanupJob.find().select('resourceType resourceId -_id').lean(), [
    { resourceType: 'asset', resourceId: 'section-child-asset' },
  ]);
  const remaining = await Section.find({ courseId: draft.id }).sort({ position: 1 }).lean();
  assert.deepEqual(remaining.map(section => section.position), [0, 1]);
});

test('video cleanup failures retain a durable job and retry successfully', async () => {
  let now = new Date('2026-01-01T00:00:00.000Z');
  let attempts = 0;
  await VideoCleanupJob.create({
    resourceType: 'asset', resourceId: 'retry-asset', availableAt: now,
  });
  const worker = createVideoCleanupWorker({
    clock: () => now,
    videoProvider: {
      async cleanupResource() {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary provider failure');
      },
    },
  });
  await worker.processNext();
  let retained = await VideoCleanupJob.findOne({ resourceId: 'retry-asset' }).lean();
  assert.equal(retained.attempts, 1);
  assert.equal(retained.leaseId, undefined);
  assert.ok(retained.availableAt > now);

  now = new Date(now.getTime() + 6000);
  await worker.processNext();
  assert.equal(attempts, 2);
  assert.equal(await VideoCleanupJob.countDocuments({ resourceId: 'retry-asset' }), 0);
});

test('video cleanup does not contact the provider when a claim finishes after shutdown', async () => {
  let releaseClaim;
  const claimed = new Promise(resolve => { releaseClaim = resolve; });
  let providerCalls = 0;
  mock.method(VideoCleanupJob, 'findOneAndUpdate', () => ({ select: () => claimed }));
  try {
    const worker = createVideoCleanupWorker({
      shutdownTimeoutMs: 5,
      videoProvider: { async cleanupResource() { providerCalls += 1; } },
    });
    const processing = worker.processNext();
    await worker.stop();
    releaseClaim({ _id: 'late-job', resourceType: 'asset', resourceId: 'late-asset' });
    await processing;
    assert.equal(providerCalls, 0);
  } finally {
    mock.restoreAll();
  }
});

test('video cleanup aborts an in-flight provider request during shutdown', async () => {
  await VideoCleanupJob.create({
    resourceType: 'asset', resourceId: 'in-flight-asset', attempts: 9,
  });
  let signal;
  let started;
  const providerStarted = new Promise(resolve => { started = resolve; });
  const worker = createVideoCleanupWorker({
    shutdownTimeoutMs: 50,
    videoProvider: {
      cleanupResource({ signal: receivedSignal }) {
        signal = receivedSignal;
        started();
        return new Promise((resolve, reject) => {
          receivedSignal.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          }, { once: true });
        });
      },
    },
  });
  const processing = worker.processNext();
  await providerStarted;
  await worker.stop();
  await processing;
  assert.equal(signal.aborted, true);

  const released = await VideoCleanupJob.findOne({ resourceId: 'in-flight-asset' })
    .select('+leaseId');
  assert.equal(released.attempts, 9);
  assert.equal(released.leaseId, null);
  assert.ok(released.availableAt <= new Date());

  let retryCalls = 0;
  const replacementWorker = createVideoCleanupWorker({
    videoProvider: { async cleanupResource() { retryCalls += 1; } },
  });
  await replacementWorker.processNext();
  assert.equal(retryCalls, 1);
  assert.equal(await VideoCleanupJob.countDocuments({ resourceId: 'in-flight-asset' }), 0);
});

test('video cleanup exhausts a job only after the final provider failure completes', async () => {
  await VideoCleanupJob.create({
    resourceType: 'asset', resourceId: 'exhausted-asset', attempts: 9,
  });
  let providerCalls = 0;
  const worker = createVideoCleanupWorker({
    videoProvider: { async cleanupResource() {
      providerCalls += 1;
      throw new Error('permanent provider failure');
    } },
  });

  await worker.processNext();
  const exhausted = await VideoCleanupJob.findOne({ resourceId: 'exhausted-asset' });
  assert.equal(exhausted.attempts, 10);
  assert.ok(exhausted.exhaustedAt instanceof Date);
  assert.equal(await worker.processNext(), false);
  assert.equal(providerCalls, 1);
});

test('curriculum mutations reject non-draft courses without changing children', async () => {
  const owner = await instructor('published-curriculum@example.com');
  const published = await course(owner.user.id, { status: 'published' });
  const response = await auth('post',
    `/api/v1/instructor/courses/${published.id}/sections`, owner.token)
    .send({ title: 'Should not exist' });
  assert.equal(response.status, 404);
  assert.equal(await Section.countDocuments(), 0);
});
