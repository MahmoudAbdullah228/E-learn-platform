import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { Category } from '../src/models/Category.js';
import { Course } from '../src/models/Course.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { User } from '../src/models/User.js';
import { createSessionService } from '../src/modules/auth/session.service.js';
import { seedCategories } from '../src/services/seed.service.js';

const app = createApp();
const password = 'category integration password';
let databaseReady = false;

before(async () => {
  await connectDatabase({ maxRetries: 1 });
  assert.match(mongoose.connection.name, /_test$/);
  await Promise.all([Category.init(), Course.init(), User.init(), RefreshSession.init()]);
  databaseReady = true;
});
beforeEach(async () => {
  await Promise.all([Course.deleteMany({}), Category.deleteMany({}),
    RefreshSession.deleteMany({}), User.deleteMany({})]);
});
after(async () => {
  try {
    if (databaseReady && mongoose.connection.readyState === 1) {
      await Promise.all([Course.deleteMany({}), Category.deleteMany({}),
        RefreshSession.deleteMany({}), User.deleteMany({})]);
    }
  } finally { await disconnectDatabase(); }
});

async function login(email, role) {
  await User.create({
    name: 'Category Test', email, passwordHash: await bcrypt.hash(password, 10),
    emailVerifiedAt: new Date(), roles: [role], status: 'active',
  });
  const session = await createSessionService().login({ email, password });
  return session.accessToken;
}
const authorized = (method, path, token) => request(app)[method](path)
  .auth(token, { type: 'bearer' });

test('public list exposes only active categories with stable pagination', async () => {
  await Category.create([
    { name: 'Alpha', slug: 'alpha' },
    { name: 'Beta', slug: 'beta' },
    { name: 'Hidden', slug: 'hidden', isActive: false },
  ]);
  const first = await request(app).get('/api/v1/categories?page=1&limit=1').expect(200);
  assert.deepEqual(first.body.data.categories.map(item => item.slug), ['alpha']);
  assert.deepEqual(first.body.data.pagination,
    { page: 1, limit: 1, total: 2, totalPages: 2 });
  const second = await request(app).get('/api/v1/categories?page=2&limit=1').expect(200);
  assert.deepEqual(second.body.data.categories.map(item => item.slug), ['beta']);
  await request(app).get('/api/v1/categories?isActive=false').expect(400);
});

test('category administration requires admin and validates input', async () => {
  const student = await login('category-student@example.test', 'student');
  await request(app).get('/api/v1/admin/categories').expect(401);
  await authorized('get', '/api/v1/admin/categories', student).expect(403);
  await authorized('post', '/api/v1/admin/categories', student)
    .send({ name: 'Science', slug: 'science' }).expect(403);
  const admin = await login('category-admin@example.test', 'admin');
  await authorized('post', '/api/v1/admin/categories', admin)
    .send({ name: 'Science', slug: 'Science' }).expect(400);
  await authorized('post', '/api/v1/admin/categories', admin)
    .send({ name: 'Science', slug: 'science', isActive: false }).expect(400);
  await authorized('patch', `/api/v1/admin/categories/${new mongoose.Types.ObjectId()}`, admin)
    .send({}).expect(400);
});

test('admin can create, rename, archive, reactivate, and filter categories', async () => {
  const admin = await login('category-admin-flow@example.test', 'admin');
  const created = await authorized('post', '/api/v1/admin/categories', admin)
    .send({ name: 'Backend', slug: 'backend' }).expect(201);
  const id = created.body.data.category.id;
  assert.equal(created.body.data.category.isActive, true);
  assert.equal(created.headers['cache-control'], 'no-store');
  const updated = await authorized('patch', `/api/v1/admin/categories/${id}`, admin)
    .send({ name: 'Server Engineering', slug: 'server-engineering', isActive: false })
    .expect(200);
  assert.equal(updated.body.data.category.slug, 'server-engineering');
  assert.equal(updated.body.data.category.isActive, false);
  assert.equal((await request(app).get('/api/v1/categories').expect(200))
    .body.data.pagination.total, 0);
  const archived = await authorized('get', '/api/v1/admin/categories?isActive=false', admin)
    .expect(200);
  assert.deepEqual(archived.body.data.categories.map(item => item.id), [id]);
  await authorized('patch', `/api/v1/admin/categories/${id}`, admin)
    .send({ isActive: true }).expect(200);
  assert.equal((await request(app).get('/api/v1/categories').expect(200))
    .body.data.pagination.total, 1);
  await authorized('get', '/api/v1/admin/categories?isActive=maybe', admin).expect(400);
});

test('duplicate slugs conflict under concurrent creates and updates', async () => {
  const admin = await login('category-admin-duplicate@example.test', 'admin');
  const requests = await Promise.all([1, 2].map(() =>
    authorized('post', '/api/v1/admin/categories', admin)
      .send({ name: 'Concurrency', slug: 'concurrency' })));
  assert.deepEqual(requests.map(response => response.status).sort(), [201, 409]);
  assert.equal(requests.find(response => response.status === 409).body.error.code,
    'CATEGORY_SLUG_EXISTS');
  const other = await authorized('post', '/api/v1/admin/categories', admin)
    .send({ name: 'Other', slug: 'other' }).expect(201);
  await authorized('patch', `/api/v1/admin/categories/${other.body.data.category.id}`, admin)
    .send({ slug: 'concurrency' }).expect(409);
  assert.equal((await Category.findById(other.body.data.category.id)).slug, 'other');
});

test('archiving and seeding preserve course references and admin edits', async () => {
  const admin = await login('category-admin-seed@example.test', 'admin');
  const instructor = await User.create({
    name: 'Course Owner', email: 'category-owner@example.test',
    passwordHash: await bcrypt.hash(password, 10), emailVerifiedAt: new Date(),
    roles: ['student', 'instructor'], instructorStatus: 'approved',
  });
  const [seeded] = await seedCategories(['Programming and Development']);
  const course = await Course.create({
    instructorId: instructor.id, categoryId: seeded.id, title: 'Existing Course',
    slug: 'existing-course', description: 'Existing course keeps its category reference.',
    priceMinor: 0,
  });
  await authorized('patch', `/api/v1/admin/categories/${seeded.id}`, admin)
    .send({ name: 'Archived Programming', isActive: false }).expect(200);
  await seedCategories(['Programming and Development']);
  const retained = await Category.findById(seeded.id);
  assert.equal(retained.name, 'Archived Programming');
  assert.equal(retained.isActive, false);
  assert.equal((await Course.findById(course.id)).categoryId.toString(), seeded.id);
  assert.equal(await Category.countDocuments(), 1);
});
