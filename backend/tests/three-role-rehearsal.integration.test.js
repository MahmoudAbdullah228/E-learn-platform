import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import test from 'node:test';

import mongoose from 'mongoose';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { assertApplicationDatabase } from '../src/config/db.js';
import { assertTransactionSupport } from '../src/config/transactions.js';
import { createMuxVideoProvider } from '../src/services/muxVideo.service.js';
import { seedAdmin, seedCategories } from '../src/services/seed.service.js';

test('three-role rehearsal creates verified accounts and exercises publication and learning through HTTP', async () => {
  assert.equal(env.NODE_ENV, 'test');
  assertApplicationDatabase(env.DATABASE_URI);
  const database = 's316_' + randomUUID().replaceAll('-', '') + '_test';
  const mail = new Map();
  const webhookSecret = randomUUID();
  let attemptId;
  const videoProvider = { ...createMuxVideoProvider({ webhookSecret }),
    async cancelDirectUpload() {},
    async createDirectUpload(input) {
      attemptId = input.attemptId;
      return { id: 'upload-fixture', url: 'https://example.test/upload', timeoutSeconds: 600 };
    },
  };
  const mediaProvider = {
    createSignedUpload() { return { expiresAt: new Date(Date.now() + 60000),
      providerUploadValidUntil: new Date(Date.now() + 3600000) }; },
    async inspectUpload(asset) { return { public_id: asset.publicId, asset_id: 'cover-fixture',
      type: 'upload', resource_type: 'image', format: 'jpg', bytes: 256 }; },
    publicImageUrl() { return 'https://example.test/cover.jpg'; },
  };
  const app = createApp({ videoProvider, mediaProvider, emailSender: {
    async sendEmailVerification({ recipientEmail, token }) { mail.set(recipientEmail, token); },
  } });
  const http = request(app);
  const password = randomUUID();
  async function login(email) {
    const response = await http.post('/api/v1/auth/login').set('Origin', 'http://localhost:5173').send({ email, password }).expect(200);
    return response.body.data.accessToken;
  }
  async function register(name, email) {
    await http.post('/api/v1/auth/register').send({ name, email, password }).expect(201);
    await http.post('/api/v1/auth/verify-email').send({ token: mail.get(email) }).expect(200);
    return login(email);
  }
  await mongoose.connect(env.DATABASE_URI, { dbName: database, serverSelectionTimeoutMS: 5000 });
  try {
    assert.equal(mongoose.connection.name, database);
    await assertTransactionSupport();
    await Promise.all(Object.values(mongoose.models).map(model => model.init()));
    await seedAdmin({ name: 'Demo Admin', email: 'admin@example.test', password });
    const [category] = await seedCategories(['Demo category']);
    const admin = await login('admin@example.test');
    const student = await register('Demo Student', 'student@example.test');
    const applicant = await register('Demo Instructor', 'instructor@example.test');
    const draft = { title: 'Local course rehearsal', description: 'A local rehearsal of authoring and review.',
      shortDescription: 'A local course rehearsal', language: 'en', level: 'beginner', priceMinor: 0, categoryId: category.id };
    const courses = '/api/v1/instructor/courses';
    await http.post(courses).auth(applicant, { type: 'bearer' }).send(draft).expect(403);
    const application = await http.post('/api/v1/instructor-applications').auth(applicant, { type: 'bearer' })
      .send({ bio: 'I teach backend engineering and build maintainable learning applications.', expertise: 'Backend engineering' }).expect(201);
    const review = '/api/v1/admin/instructor-applications/' + application.body.data.application.id;
    await http.patch(review).auth(student, { type: 'bearer' }).send({ status: 'approved' }).expect(403);
    await http.patch(review).auth(admin, { type: 'bearer' }).send({ status: 'approved' }).expect(200);
    const instructor = await login('instructor@example.test');
    const created = await http.post(courses).auth(instructor, { type: 'bearer' }).send(draft).expect(201);
    const course = created.body.data.course;
    assert.equal(course.status, 'draft');
    await http.post(courses + '/' + course.id + '/submit-review').auth(instructor, { type: 'bearer' }).send({}).expect(409);
    await http.get('/api/v1/courses/' + course.slug).expect(404);
    const post = (path, body) => http.post('/api/v1/' + path).auth(instructor, { type: 'bearer' }).send(body);
    const intent = await post('media/upload-intents', { purpose: 'course_cover', targetId: course.id }).expect(201);
    await post('media/' + intent.body.data.assetId + '/confirm', {}).expect(200);
    const section = await post('instructor/courses/' + course.id + '/sections', { title: 'First section' }).expect(201);
    const lesson = await post('instructor/sections/' + section.body.data.section.id + '/lessons', { title: 'First lesson' }).expect(201);
    const lessonId = lesson.body.data.lesson.id;
    await post('instructor/lessons/' + lessonId + '/video-upload', {}).expect(201);
    const payload = JSON.stringify({ type: 'video.asset.ready', data: { id: 'asset-fixture', duration: 60, passthrough: attemptId } });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', webhookSecret).update(timestamp + '.' + payload).digest('hex');
    await http.post('/api/v1/webhooks/video').set('Content-Type', 'application/json')
      .set('mux-signature', 't=' + timestamp + ',v1=' + signature).send(payload).expect(200);
    await post('instructor/courses/' + course.id + '/submit-review', {}).expect(200);
    await http.patch('/api/v1/admin/courses/' + course.id + '/review').auth(admin, { type: 'bearer' })
      .send({ decision: 'approve' }).expect(200);
    await http.get('/api/v1/courses/' + course.slug).expect(200);
    await http.post('/api/v1/courses/' + course.id + '/enroll').auth(student, { type: 'bearer' }).send({}).expect(201);
    const completion = await http.put('/api/v1/users/me/courses/' + course.id + '/lessons/' + lessonId + '/progress')
      .auth(student, { type: 'bearer' }).send({ completed: true }).expect(200);
    assert.equal(completion.body.data.progress.percentage, 100);
  } finally {
    try { if (mongoose.connection.name === database) await mongoose.connection.db.dropDatabase(); }
    finally { await mongoose.disconnect(); }
  }
});
