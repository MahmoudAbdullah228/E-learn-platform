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
import { Lesson } from '../src/models/Lesson.js';
import { MediaAsset } from '../src/models/MediaAsset.js';
import { MediaCleanupJob } from '../src/models/MediaCleanupJob.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { Section } from '../src/models/Section.js';
import { User } from '../src/models/User.js';
import { createSessionService } from '../src/modules/auth/session.service.js';
import { createMediaCleanupWorker } from '../src/services/mediaCleanupWorker.service.js';
import { createCloudinaryMediaProvider } from '../src/services/cloudinaryMedia.service.js';

const uploaded = new Map();
const deleted = [];
const provider = {
  publicImageUrl({ publicId, format }) {
    return `https://res.cloudinary.com/media-test/image/upload/${publicId}.${format}`;
  },
  createSignedUpload({ publicId, purpose }) {
    const attachment = purpose === 'lesson_attachment';
    return {
      uploadUrl: 'https://api.cloudinary.com/upload', apiKey: 'test-key', signature: 'signature',
      parameters: { public_id: publicId, overwrite: false,
        timestamp: Math.floor(Date.now() / 1000) },
      resourceType: attachment ? 'raw' : 'image',
      deliveryType: attachment ? 'authenticated' : 'upload',
      expiresAt: new Date(Date.now() + 600000),
      providerUploadValidUntil: new Date((Math.floor(Date.now() / 1000) + 3600) * 1000),
    };
  },
  async inspectUpload(asset) { return uploaded.get(asset.publicId) ?? null; },
  async deleteUpload(asset) { deleted.push(asset.publicId); },
};
const app = createApp({ mediaProvider: provider });
let databaseReady = false;
const password = 'correct horse battery staple';

before(async () => {
  await connectDatabase({ maxRetries: 1 });
  assert.match(mongoose.connection.name, /_test$/);
  await assertTransactionSupport();
  await Promise.all([User.init(), RefreshSession.init(), Category.init(), Course.init(),
    Section.init(), Lesson.init(), MediaAsset.init(), MediaCleanupJob.init()]);
  databaseReady = true;
});
beforeEach(async () => {
  uploaded.clear();
  deleted.length = 0;
  await Promise.all([MediaCleanupJob.deleteMany({}), MediaAsset.deleteMany({}),
    Lesson.deleteMany({}), Section.deleteMany({}), Course.deleteMany({}), Category.deleteMany({}),
    RefreshSession.deleteMany({}), User.deleteMany({})]);
});
after(async () => {
  try {
    if (databaseReady && mongoose.connection.readyState === 1) {
      await Promise.all([MediaCleanupJob.deleteMany({}), MediaAsset.deleteMany({}),
        Lesson.deleteMany({}), Section.deleteMany({}), Course.deleteMany({}), Category.deleteMany({}),
        RefreshSession.deleteMany({}), User.deleteMany({})]);
    }
  } finally { await disconnectDatabase(); }
});

async function account(email, instructor = false) {
  const user = await User.create({
    name: 'Media Test User', email, passwordHash: await bcrypt.hash(password, 10),
    emailVerifiedAt: new Date(),
    roles: instructor ? ['student', 'instructor'] : ['student'],
    instructorStatus: instructor ? 'approved' : 'none',
    instructorProfile: instructor ? {
      bio: 'I teach practical backend engineering and secure media integrations.',
      expertise: 'Backend engineering',
    } : undefined,
  });
  const session = await createSessionService().login({ email, password });
  return { user, token: session.accessToken };
}
const auth = (method, path, token) => request(app)[method](path).auth(token, { type: 'bearer' });

test('maximum configured upload lifetime creates a usable intent', async () => {
  const owner = await account('media-max-ttl@example.test');
  const maxTtlProvider = createCloudinaryMediaProvider({
    cloudName: 'ttl-test', apiKey: 'test-key', apiSecret: 'test-secret',
    imageUploadPreset: 'images', attachmentUploadPreset: 'attachments',
    uploadIntentTtlSeconds: 3600,
    cloudinaryClient: { utils: { api_sign_request: () => 'test-signature' } },
  });
  const ttlApp = createApp({ mediaProvider: maxTtlProvider });
  const response = await request(ttlApp).post('/api/v1/media/upload-intents')
    .auth(owner.token, { type: 'bearer' })
    .send({ purpose: 'avatar', targetId: owner.user.id }).expect(201);
  const asset = await MediaAsset.findById(response.body.data.assetId);
  assert.equal(asset.expiresAt.getTime(), asset.providerUploadValidUntil.getTime());
});

async function curriculum(ownerId) {
  const category = await Category.create({ name: 'Media', slug: 'media' });
  const course = await Course.create({
    instructorId: ownerId, categoryId: category.id, title: 'Media Course', slug: 'media-course',
    description: 'A draft course for secure Cloudinary integration testing.', priceMinor: 0,
  });
  const section = await Section.create({ courseId: course.id, title: 'Media section', position: 0 });
  const lesson = await Lesson.create({ sectionId: section.id, title: 'Media lesson', position: 0 });
  return { course, lesson };
}

async function intent(token, purpose, targetId) {
  return auth('post', '/api/v1/media/upload-intents', token)
    .send({ purpose, targetId }).expect(201);
}

async function upload(assetId, overrides = {}) {
  const asset = await MediaAsset.findById(assetId);
  uploaded.set(asset.publicId, {
    public_id: asset.publicId, asset_id: `provider-${asset.id}`,
    resource_type: asset.resourceType, type: asset.deliveryType,
    ...(asset.purpose === 'lesson_attachment' ? {} : { format: 'png' }),
    bytes: 1024, original_filename: 'safe-name', ...overrides,
  });
  return asset;
}

test('intent enforces target ownership and rejects protected metadata', async () => {
  const owner = await account('media-owner@example.test', true);
  const other = await account('media-other@example.test', true);
  const { course, lesson } = await curriculum(owner.user.id);
  await auth('post', '/api/v1/media/upload-intents', other.token)
    .send({ purpose: 'course_cover', targetId: course.id }).expect(404);
  await auth('post', '/api/v1/media/upload-intents', other.token)
    .send({ purpose: 'lesson_attachment', targetId: lesson.id }).expect(404);
  await auth('post', '/api/v1/media/upload-intents', other.token)
    .send({ purpose: 'avatar', targetId: owner.user.id }).expect(404);
  await auth('post', '/api/v1/media/upload-intents', owner.token)
    .send({ purpose: 'course_cover', targetId: course.id, publicId: 'forged' }).expect(400);
  const response = await intent(owner.token, 'course_cover', course.id);
  assert.equal(response.body.data.upload.parameters.overwrite, false);
  assert.equal(response.headers['cache-control'], 'no-store');
  const stored = await MediaAsset.findById(response.body.data.assetId);
  assert.equal(stored.providerUploadValidUntil.toISOString(),
    response.body.data.upload.providerUploadValidUntil);
  assert.equal(await MediaAsset.countDocuments(), 1);
});

test('removing the instructor role blocks new course media operations', async () => {
  const owner = await account('media-demoted@example.test', true);
  const { course } = await curriculum(owner.user.id);
  const created = await intent(owner.token, 'course_cover', course.id);
  await upload(created.body.data.assetId);
  await User.updateOne({ _id: owner.user.id },
    { $set: { roles: ['student'], instructorStatus: 'none' } });
  await auth('post', '/api/v1/media/upload-intents', owner.token)
    .send({ purpose: 'course_cover', targetId: course.id }).expect(404);
  await auth('post', `/api/v1/media/${created.body.data.assetId}/confirm`, owner.token)
    .send({}).expect(404);
});

test('confirm trusts provider data, claims once, and attaches all three purposes', async () => {
  const owner = await account('media-confirm@example.test', true);
  const other = await account('media-confirm-other@example.test');
  const { course, lesson } = await curriculum(owner.user.id);
  const cases = [
    ['avatar', owner.user.id], ['course_cover', course.id], ['lesson_attachment', lesson.id],
  ];
  for (const [purpose, targetId] of cases) {
    const created = await intent(owner.token, purpose, targetId);
    const assetId = created.body.data.assetId;
    const asset = await upload(assetId);
    await auth('post', `/api/v1/media/${assetId}/confirm`, other.token).send({}).expect(404);
    const result = await auth('post', `/api/v1/media/${assetId}/confirm`, owner.token)
      .send({ bytes: 1 }).expect(400);
    assert.equal(result.body.error.code, 'VALIDATION_ERROR');
    const confirmed = await auth('post', `/api/v1/media/${assetId}/confirm`, owner.token)
      .send({}).expect(200);
    assert.equal(confirmed.body.data.asset.status, 'ready');
    assert.equal(confirmed.body.data.asset.bytes, 1024);
    assert.equal((await MediaAsset.findById(assetId)).providerAssetId, `provider-${asset.id}`);
    await auth('post', `/api/v1/media/${assetId}/confirm`, owner.token).send({}).expect(404);
  }
  assert.equal((await User.findById(owner.user.id)).avatarAssetId.toString(),
    (await MediaAsset.findOne({ purpose: 'avatar' })).id);
  assert.equal((await Course.findById(course.id)).coverAssetId.toString(),
    (await MediaAsset.findOne({ purpose: 'course_cover' })).id);
  assert.equal((await Lesson.findById(lesson.id)).attachments.length, 1);
});

test('avatar URLs work through upload, profile update, replacement and removal', async () => {
  const owner = await account('avatar-display@example.test', true);
  const first = await intent(owner.token, 'avatar', owner.user.id);
  const pending = await auth('get', '/api/v1/users/me', owner.token).expect(200);
  assert.equal(pending.body.data.user.avatarUrl, null);
  const asset = await upload(first.body.data.assetId);
  await auth('post', `/api/v1/media/${asset.id}/confirm`, owner.token).send({}).expect(200);
  const expected = provider.publicImageUrl({ publicId: asset.publicId, format: 'png' });
  const profile = await auth('get', '/api/v1/users/me', owner.token).expect(200);
  assert.equal(profile.body.data.user.avatarUrl, expected);
  assert.equal(profile.body.data.user.avatarAssetId, asset.id);
  const edited = await auth('patch', '/api/v1/users/me', owner.token)
    .send({ name: 'Updated Avatar Owner' }).expect(200);
  assert.equal(edited.body.data.user.avatarUrl, expected);
  const publicProfile = await request(app).get(`/api/v1/instructors/${owner.user.id}`).expect(200);
  assert.equal(publicProfile.body.data.instructor.avatarUrl, expected);
  assert.equal('email' in publicProfile.body.data.instructor, false);
  const instructorEdit = await auth('patch', '/api/v1/instructor/profile', owner.token)
    .send({ expertise: 'Secure backend architecture' }).expect(200);
  assert.equal(instructorEdit.body.data.instructor.avatarUrl, expected);

  const second = await intent(owner.token, 'avatar', owner.user.id);
  const replacement = await upload(second.body.data.assetId);
  await auth('post', `/api/v1/media/${replacement.id}/confirm`, owner.token).send({}).expect(200);
  const replaced = await auth('get', '/api/v1/users/me', owner.token).expect(200);
  assert.equal(replaced.body.data.user.avatarUrl,
    provider.publicImageUrl({ publicId: replacement.publicId, format: 'png' }));
  assert.equal((await MediaAsset.findById(asset.id)).status, 'deleting');
  await auth('delete', `/api/v1/media/${replacement.id}`, owner.token).expect(204);
  const removed = await auth('get', '/api/v1/users/me', owner.token).expect(200);
  assert.equal(removed.body.data.user.avatarAssetId, null);
  assert.equal(removed.body.data.user.avatarUrl, null);
  const publicRemoved = await request(app).get(`/api/v1/instructors/${owner.user.id}`).expect(200);
  assert.equal(publicRemoved.body.data.instructor.avatarUrl, null);
});

test('profile image resolution rejects corrupt associations and nonpublic or unready assets', async () => {
  const owner = await account('avatar-guards@example.test', true);
  const created = await intent(owner.token, 'avatar', owner.user.id);
  const asset = await upload(created.body.data.assetId);
  await auth('post', `/api/v1/media/${asset.id}/confirm`, owner.token).send({}).expect(200);
  const baseline = (await MediaAsset.findById(asset.id)).toObject();
  const cases = [
    { ownerId: new mongoose.Types.ObjectId() }, { targetId: new mongoose.Types.ObjectId() },
    { purpose: 'course_cover' }, { resourceType: 'raw' }, { deliveryType: 'authenticated' },
    { status: 'pending' }, { status: 'deleting' }, { status: 'deleted' }, { format: 'pdf' },
  ];
  for (const fields of cases) {
    await MediaAsset.collection.updateOne({ _id: asset._id }, { $set: fields });
    const own = await auth('get', '/api/v1/users/me', owner.token).expect(200);
    const instructor = await request(app).get(`/api/v1/instructors/${owner.user.id}`).expect(200);
    assert.equal(own.body.data.user.avatarUrl, null);
    assert.equal(instructor.body.data.instructor.avatarUrl, null);
    assert.equal(JSON.stringify(own.body).includes(asset.publicId), false);
    const reset = Object.fromEntries(Object.keys(fields).map(key => [key, baseline[key]]));
    await MediaAsset.collection.updateOne({ _id: asset._id }, { $set: reset });
  }
  await MediaAsset.deleteOne({ _id: asset.id });
  const missing = await auth('get', '/api/v1/users/me', owner.token).expect(200);
  assert.equal(missing.body.data.user.avatarUrl, null);
});

test('profile remains readable when no public image URL is configured', async () => {
  const owner = await account('avatar-unconfigured@example.test');
  const created = await intent(owner.token, 'avatar', owner.user.id);
  const asset = await upload(created.body.data.assetId);
  await auth('post', `/api/v1/media/${asset.id}/confirm`, owner.token).send({}).expect(200);
  const noImagesApp = createApp({ mediaProvider: { publicImageUrl: () => null } });
  const result = await request(noImagesApp).get('/api/v1/users/me')
    .auth(owner.token, { type: 'bearer' }).expect(200);
  assert.equal(result.body.data.user.avatarAssetId, asset.id);
  assert.equal(result.body.data.user.avatarUrl, null);
});

test('invalid provider metadata never attaches, and two confirms cannot both commit', async () => {
  const owner = await account('media-invalid@example.test', true);
  const { course } = await curriculum(owner.user.id);
  const created = await intent(owner.token, 'course_cover', course.id);
  const assetId = created.body.data.assetId;
  await upload(assetId, { bytes: 100_000_000 });
  const invalid = await auth('post', `/api/v1/media/${assetId}/confirm`, owner.token)
    .send({}).expect(409);
  assert.equal(invalid.body.error.code, 'MEDIA_UPLOAD_INVALID');
  assert.equal((await Course.findById(course.id)).coverAssetId, null);
  await upload(assetId);
  const results = await Promise.all([1, 2].map(() =>
    auth('post', `/api/v1/media/${assetId}/confirm`, owner.token).send({})));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
});

test('raw PDF confirmation uses exact extension-bearing ID without requiring format metadata', async () => {
  const owner = await account('media-raw-pdf@example.test', true);
  const { lesson } = await curriculum(owner.user.id);
  const created = await intent(owner.token, 'lesson_attachment', lesson.id);
  const assetId = created.body.data.assetId;
  assert.match(created.body.data.upload.parameters.public_id, /\.pdf$/);
  for (const invalid of [
    { public_id: 'foreign/file.pdf' }, { format: 'zip' },
    { type: 'upload' }, { resource_type: 'image' }, { bytes: 100_000_000 },
  ]) {
    await upload(assetId, invalid);
    const response = await auth('post', `/api/v1/media/${assetId}/confirm`, owner.token)
      .send({}).expect(409);
    assert.equal(response.body.error.code, 'MEDIA_UPLOAD_INVALID');
    assert.equal((await Lesson.findById(lesson.id)).attachments.length, 0);
  }
  await upload(assetId);
  const confirmed = await auth('post', `/api/v1/media/${assetId}/confirm`, owner.token)
    .send({}).expect(200);
  assert.equal(confirmed.body.data.asset.format, 'pdf');
});

test('legacy extensionless PDF intents confirm against the actual raw ID', async () => {
  const owner = await account('media-legacy-pdf@example.test', true);
  const { lesson } = await curriculum(owner.user.id);
  const asset = await MediaAsset.create({ ownerId: owner.user.id,
    purpose: 'lesson_attachment', targetId: lesson.id,
    publicId: `elearn/lesson_attachment/${owner.user.id}/legacy`,
    resourceType: 'raw', deliveryType: 'authenticated',
    expiresAt: new Date(Date.now() + 600000),
    providerUploadValidUntil: new Date(Date.now() + 3600000),
  });
  await upload(asset.id, { public_id: `${asset.publicId}.pdf` });
  const result = await auth('post', `/api/v1/media/${asset.id}/confirm`, owner.token)
    .send({}).expect(200);
  assert.equal(result.body.data.asset.format, 'pdf');
  assert.equal((await MediaAsset.findById(asset.id)).publicId, asset.publicId);
});

test('delete detaches first and cleanup removes the Cloudinary object', async () => {
  const owner = await account('media-delete@example.test', true);
  const { course } = await curriculum(owner.user.id);
  const created = await intent(owner.token, 'course_cover', course.id);
  const asset = await upload(created.body.data.assetId);
  await auth('post', `/api/v1/media/${asset.id}/confirm`, owner.token).send({}).expect(200);
  await auth('delete', `/api/v1/media/${asset.id}`, owner.token).expect(204);
  assert.equal((await Course.findById(course.id)).coverAssetId, null);
  assert.equal((await MediaAsset.findById(asset.id)).status, 'deleting');
  assert.ok(await MediaCleanupJob.exists({ assetId: asset._id }));
  await app.locals.mediaCleanupWorker.processNext();
  assert.deepEqual(deleted, [asset.publicId]);
  assert.equal((await MediaAsset.findById(asset.id)).status, 'deleted');
});

test('replacing a cover retains the new reference and queues the old asset', async () => {
  const owner = await account('media-replace@example.test', true);
  const { course } = await curriculum(owner.user.id);
  const first = await intent(owner.token, 'course_cover', course.id);
  const oldAsset = await upload(first.body.data.assetId);
  await auth('post', `/api/v1/media/${oldAsset.id}/confirm`, owner.token).send({}).expect(200);
  const second = await intent(owner.token, 'course_cover', course.id);
  const newAsset = await upload(second.body.data.assetId);
  await auth('post', `/api/v1/media/${newAsset.id}/confirm`, owner.token).send({}).expect(200);
  assert.equal((await Course.findById(course.id)).coverAssetId.toString(), newAsset.id);
  assert.equal((await MediaAsset.findById(oldAsset.id)).status, 'deleting');
  await app.locals.mediaCleanupWorker.processNext();
  assert.deepEqual(deleted, [oldAsset.publicId]);
  assert.equal((await MediaAsset.findById(newAsset.id)).status, 'ready');
});

test('published targets reject media changes and section deletion queues PDF cleanup', async () => {
  const owner = await account('media-lesson@example.test', true);
  const { course, lesson } = await curriculum(owner.user.id);
  const created = await intent(owner.token, 'lesson_attachment', lesson.id);
  const asset = await upload(created.body.data.assetId);
  await auth('post', `/api/v1/media/${asset.id}/confirm`, owner.token).send({}).expect(200);
  await Course.updateOne({ _id: course.id }, { $set: { status: 'published' } });
  const blockedDelete = await auth('delete', `/api/v1/media/${asset.id}`,
    owner.token).expect(409);
  assert.equal(blockedDelete.body.error.code, 'INVALID_COURSE_STATE');
  await auth('post', '/api/v1/media/upload-intents', owner.token)
    .send({ purpose: 'lesson_attachment', targetId: lesson.id }).expect(409);
  await Course.updateOne({ _id: course.id }, { $set: { status: 'draft' } });
  const section = await Section.findById(lesson.sectionId);
  await auth('delete', `/api/v1/instructor/courses/${course.id}/sections/${section.id}`,
    owner.token).expect(200);
  assert.ok(await MediaCleanupJob.exists({ assetId: asset._id }));
  await app.locals.mediaCleanupWorker.processNext();
  assert.deepEqual(deleted, [asset.publicId]);
});

test('expired pending intent cannot confirm and receives a delayed cleanup job', async () => {
  const owner = await account('media-expired@example.test', true);
  const { course } = await curriculum(owner.user.id);
  const created = await intent(owner.token, 'course_cover', course.id);
  const asset = await upload(created.body.data.assetId);
  await MediaAsset.updateOne({ _id: asset._id },
    { $set: { expiresAt: new Date(Date.now() - 1000) } });
  await auth('post', `/api/v1/media/${asset.id}/confirm`, owner.token).send({}).expect(409);
  await app.locals.mediaCleanupWorker.processNext();
  const job = await MediaCleanupJob.findOne({ assetId: asset._id });
  assert.equal((await MediaAsset.findById(asset.id)).status, 'deleting');
  assert.ok(job.availableAt.getTime() >= asset.providerUploadValidUntil.getTime() + 300000);
  assert.deepEqual(deleted, []);
});

test('cleanup sweeps expired intents in bounded batches instead of one per interval', async () => {
  const owner = await account('media-backlog@example.test');
  const now = new Date();
  await MediaAsset.insertMany(Array.from({ length: 30 }, (_, index) => ({
    ownerId: owner.user.id, purpose: 'avatar', targetId: owner.user.id,
    publicId: `backlog/${index}`, resourceType: 'image', deliveryType: 'upload',
    status: 'pending', expiresAt: new Date(now.getTime() - 1000),
    providerUploadValidUntil: new Date(now.getTime() + 3600000),
  })));
  const worker = createMediaCleanupWorker({ provider, clock: () => now });
  assert.equal(await worker.processNext(), true);
  assert.equal(await MediaAsset.countDocuments({ status: 'deleting' }), 25);
  assert.equal(await MediaCleanupJob.countDocuments(), 25);
  assert.equal(await worker.processNext(), true);
  assert.equal(await MediaAsset.countDocuments({ status: 'deleting' }), 30);
  assert.equal(await MediaCleanupJob.countDocuments(), 30);
  await worker.stop();
});

test('explicit deletion of a pending intent waits until the provider signature expires', async () => {
  const owner = await account('media-pending-delete@example.test', true);
  const { course } = await curriculum(owner.user.id);
  const created = await intent(owner.token, 'course_cover', course.id);
  const asset = await MediaAsset.findById(created.body.data.assetId);
  await auth('delete', `/api/v1/media/${asset.id}`, owner.token).expect(204);
  const job = await MediaCleanupJob.findOne({ assetId: asset._id });
  assert.ok(job.availableAt.getTime() >= asset.providerUploadValidUntil.getTime() + 300000);
  await app.locals.mediaCleanupWorker.processNext();
  assert.deepEqual(deleted, []);
});

test('cleanup retries a provider failure without losing the detached asset', async () => {
  const owner = await account('media-retry@example.test', true);
  const { course } = await curriculum(owner.user.id);
  const created = await intent(owner.token, 'course_cover', course.id);
  const asset = await upload(created.body.data.assetId);
  await auth('post', `/api/v1/media/${asset.id}/confirm`, owner.token).send({}).expect(200);
  await auth('delete', `/api/v1/media/${asset.id}`, owner.token).expect(204);
  let attempts = 0;
  let now = new Date();
  const worker = createMediaCleanupWorker({
    provider: { async deleteUpload() {
      attempts += 1;
      if (attempts === 1) throw new Error('provider unavailable');
    } },
    clock: () => now,
  });
  assert.equal(await worker.processNext(), true);
  const retry = await MediaCleanupJob.findOne({ assetId: asset._id });
  assert.equal(retry.attempts, 1);
  assert.equal((await MediaAsset.findById(asset.id)).status, 'deleting');
  now = new Date(retry.availableAt.getTime() + 1000);
  assert.equal(await worker.processNext(), true);
  assert.equal(attempts, 2);
  assert.equal(await MediaCleanupJob.countDocuments({ assetId: asset._id }), 0);
  assert.equal((await MediaAsset.findById(asset.id)).status, 'deleted');
  await worker.stop();
});

for (const outcome of ['success', 'failure']) {
  test(`cleanup ignores late provider ${outcome} after shutdown and recovers the lease`, async t => {
    const owner = await account(`media-shutdown-${outcome}@example.test`);
    const created = await intent(owner.token, 'avatar', owner.user.id);
    const asset = await upload(created.body.data.assetId);
    await auth('post', `/api/v1/media/${asset.id}/confirm`, owner.token).send({}).expect(200);
    await auth('delete', `/api/v1/media/${asset.id}`, owner.token).expect(204);
    let finish;
    let entered;
    let signal;
    const started = new Promise(resolve => { entered = resolve; });
    const delayed = new Promise((resolve, reject) => {
      finish = outcome === 'success' ? resolve : () => reject(new Error('late provider failure'));
    });
    const worker = createMediaCleanupWorker({ shutdownTimeoutMs: 10,
      provider: { async deleteUpload(request) {
        signal = request.signal;
        entered();
        await delayed; // Simulate a provider that does not honor cancellation.
      } },
    });
    const running = worker.processNext();
    try {
      await started;
      await worker.stop();
      assert.equal(signal.aborted, true);
      const writes = [t.mock.method(MediaAsset, 'updateOne'),
        t.mock.method(MediaCleanupJob, 'updateOne'), t.mock.method(MediaCleanupJob, 'deleteOne')];
      finish();
      assert.equal(await running, false);
      for (const write of writes) assert.equal(write.mock.callCount(), 0);
      t.mock.restoreAll();
      assert.equal((await MediaAsset.findById(asset.id)).status, 'deleting');
      const job = await MediaCleanupJob.findOne({ assetId: asset._id }).select('+leaseId');
      assert.ok(job.leaseId);
      assert.equal(job.attempts, 0);
      const recovery = createMediaCleanupWorker({ provider,
        clock: () => new Date(job.availableAt.getTime() + 1) });
      try { assert.equal(await recovery.processNext(), true); }
      finally { await recovery.stop(); }
      assert.equal((await MediaAsset.findById(asset.id)).status, 'deleted');
      assert.equal(await MediaCleanupJob.countDocuments({ assetId: asset._id }), 0);
    } finally {
      finish();
      await worker.stop();
      await running;
    }
  });
}
