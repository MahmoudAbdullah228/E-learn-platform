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
import { RefreshSession } from '../src/models/RefreshSession.js';
import { User } from '../src/models/User.js';
import { createSessionService } from '../src/modules/auth/session.service.js';
import { createCoursesService } from '../src/modules/courses/courses.service.js';

const app = createApp();
const password = 'correct horse battery staple';
let databaseReady = false;

before(async () => {
  await connectDatabase({ maxRetries: 1 });
  assert.match(mongoose.connection.name, /_test$/);
  await assertTransactionSupport();
  await Promise.all([User.init(), RefreshSession.init(), Category.init(), Course.init()]);
  databaseReady = true;
});

beforeEach(async () => {
  await Promise.all([
    Course.deleteMany({}), Category.deleteMany({}),
    RefreshSession.deleteMany({}), User.deleteMany({}),
  ]);
});

after(async () => {
  try {
    if (databaseReady && mongoose.connection.readyState === 1) {
      const results = await Promise.allSettled([
        Course.deleteMany({}), Category.deleteMany({}),
        RefreshSession.deleteMany({}), User.deleteMany({}),
      ]);
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
    }
  } finally {
    await disconnectDatabase();
  }
});

async function authenticatedUser({ email, roles = ['instructor'] }) {
  const user = await User.create({
    name: 'Course Owner',
    email,
    passwordHash: await bcrypt.hash(password, 10),
    roles,
    instructorStatus: roles.includes('instructor') ? 'approved' : 'none',
    emailVerifiedAt: new Date(),
  });
  const session = await createSessionService().login({ email, password });
  return { user, accessToken: session.accessToken };
}

async function category(overrides = {}) {
  const id = new mongoose.Types.ObjectId();
  return Category.create({
    _id: id,
    name: `Category ${id.toString().slice(-6)}`,
    slug: `category-${id.toString().slice(-6)}`,
    ...overrides,
  });
}

function courseInput(categoryId, overrides = {}) {
  return {
    title: 'Production Backend Engineering',
    categoryId: categoryId.toString(),
    description: 'Build reliable backend services using practical production architecture.',
    requirements: ['JavaScript fundamentals'],
    learningOutcomes: ['Design maintainable REST APIs'],
    priceMinor: 125000,
    currency: 'EGP',
    ...overrides,
  };
}

function createCourse(accessToken, input) {
  return request(app).post('/api/v1/instructor/courses')
    .auth(accessToken, { type: 'bearer' }).send(input);
}

test('course endpoints require a live instructor session', async () => {
  const activeCategory = await category();
  await request(app).post('/api/v1/instructor/courses')
    .send(courseInput(activeCategory.id)).expect(401);
  const student = await authenticatedUser({ email: 'course-student@example.com', roles: ['student'] });
  const response = await createCourse(student.accessToken, courseInput(activeCategory.id));
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'INSUFFICIENT_PERMISSIONS');
});

test('creating a course persists a safe draft with normalized defaults', async () => {
  const owner = await authenticatedUser({ email: 'create-course@example.com' });
  const activeCategory = await category({ name: 'Backend', slug: 'backend' });
  const input = courseInput(activeCategory.id, {
    title: '  Clean APIs  ',
    requirements: undefined,
    learningOutcomes: undefined,
    currency: undefined,
  });
  const response = await createCourse(owner.accessToken, input);
  assert.equal(response.status, 201);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.body.data.course.title, 'Clean APIs');
  assert.equal(response.body.data.course.slug, 'clean-apis');
  assert.equal(response.body.data.course.status, 'draft');
  assert.equal(response.body.data.course.currency, 'EGP');
  assert.deepEqual(response.body.data.course.requirements, []);
  assert.equal(response.body.data.course.category.id, activeCategory.id);
  assert.equal(response.body.data.course.instructorId, owner.user.id);
  assert.equal(JSON.stringify(response.body).includes('coverKey'), false);

  const stored = await Course.findById(response.body.data.course.id).select('+coverKey');
  assert.equal(stored.coverKey, null);
  assert.equal(stored.priceMinor, 125000);
});

test('course creation rejects inactive, missing, and malformed categories', async () => {
  const owner = await authenticatedUser({ email: 'category-check@example.com' });
  const inactive = await category({ isActive: false });
  for (const categoryId of [inactive.id.toString(), new mongoose.Types.ObjectId().toString()]) {
    const response = await createCourse(owner.accessToken, courseInput(categoryId));
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'INVALID_CATEGORY');
  }
  const malformed = await createCourse(owner.accessToken, courseInput('not-an-id'));
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error.code, 'VALIDATION_ERROR');
  assert.equal(await Course.countDocuments(), 0);
});

test('strict validation rejects protected fields, invalid money, duplicates, and hidden text', async () => {
  const owner = await authenticatedUser({ email: 'course-validation@example.com' });
  const activeCategory = await category();
  const invalidInputs = [
    courseInput(activeCategory.id, { instructorId: owner.user.id }),
    courseInput(activeCategory.id, { status: 'published' }),
    courseInput(activeCategory.id, { slug: 'attacker-slug' }),
    courseInput(activeCategory.id, { priceMinor: -1 }),
    courseInput(activeCategory.id, { priceMinor: 1.5 }),
    courseInput(activeCategory.id, { currency: 'USD' }),
    courseInput(activeCategory.id, { title: 'Hidden\u200BTitle' }),
    courseInput(activeCategory.id, { requirements: ['Node.js', 'node.JS'] }),
  ];
  for (const input of invalidInputs) {
    const response = await createCourse(owner.accessToken, input);
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  }
  assert.equal(await Course.countDocuments(), 0);
});

test('the Course model enforces list and monetary invariants outside the HTTP boundary', async () => {
  const owner = await authenticatedUser({ email: 'course-model@example.com' });
  const activeCategory = await category();
  const base = {
    ...courseInput(activeCategory.id), instructorId: owner.user.id, slug: 'model-invariants',
  };
  await assert.rejects(Course.create({
    ...base, requirements: Array.from({ length: 31 }, (_, index) => `Requirement ${index}`),
  }), error => error?.name === 'ValidationError');
  await assert.rejects(Course.create({
    ...base, requirements: ['Node.js', 'node.JS'],
  }), error => error?.name === 'ValidationError');
  await assert.rejects(Course.create({
    ...base, priceMinor: Number.MAX_SAFE_INTEGER + 1,
  }), error => error?.name === 'ValidationError');
  assert.equal(await Course.countDocuments(), 0);
});

test('concurrent equal titles receive unique slugs enforced by the database index', async () => {
  const owner = await authenticatedUser({ email: 'slug-race@example.com' });
  const activeCategory = await category();
  const responses = await Promise.all(Array.from({ length: 5 }, () =>
    createCourse(owner.accessToken, courseInput(activeCategory.id))));
  assert.ok(responses.every(response => response.status === 201));
  const slugs = responses.map(response => response.body.data.course.slug);
  assert.equal(new Set(slugs).size, 5);
  assert.equal(slugs.filter(slug => slug === 'production-backend-engineering').length, 1);
  assert.equal(await Course.countDocuments(), 5);
});

test('bounded slug retries return a controlled conflict when allocation cannot succeed', async () => {
  const owner = await authenticatedUser({ email: 'slug-exhaustion@example.com' });
  const activeCategory = await category();
  const input = courseInput(activeCategory.id, { title: 'Repeated Course' });
  await Course.create({
    ...input, instructorId: owner.user.id, slug: 'repeated-course', status: 'draft',
  });
  await Course.create({
    ...input, instructorId: owner.user.id, slug: 'repeated-course-fixed', status: 'draft',
  });
  const service = createCoursesService({ slugSuffix: () => 'fixed' });
  await assert.rejects(
    service.createCourse({ instructorId: owner.user.id, input }),
    error => error?.code === 'COURSE_SLUG_CONFLICT' && error?.statusCode === 409,
  );
  assert.equal(await Course.countDocuments(), 2);
});

test('slug generation bounds Unicode compatibility expansion to the model limit', async () => {
  const owner = await authenticatedUser({ email: 'unicode-slug@example.com' });
  const activeCategory = await category();
  const response = await createCourse(owner.accessToken, courseInput(activeCategory.id, {
    title: 'ﬃ'.repeat(100),
  }));
  assert.equal(response.status, 201);
  assert.ok(response.body.data.course.slug.length <= 220);
  const stored = await Course.findById(response.body.data.course.id).lean();
  assert.ok(stored.slug.length <= 220);
});

test('listing is paginated, owner-scoped, draft-only, and resilient to deleted categories', async () => {
  const first = await authenticatedUser({ email: 'list-owner@example.com' });
  const second = await authenticatedUser({ email: 'list-other@example.com' });
  const activeCategory = await category();
  for (let index = 1; index <= 3; index += 1) {
    const response = await createCourse(first.accessToken, courseInput(activeCategory.id, {
      title: `Backend Course ${index}`,
    }));
    assert.equal(response.status, 201);
  }
  await createCourse(second.accessToken, courseInput(activeCategory.id, { title: 'Other Course' }));
  await Course.updateOne({ instructorId: first.user.id }, { $set: { status: 'published' } });
  await Category.deleteOne({ _id: activeCategory.id });

  const response = await request(app).get('/api/v1/instructor/courses?page=1&limit=2')
    .auth(first.accessToken, { type: 'bearer' }).expect(200);
  assert.equal(response.body.data.courses.length, 2);
  assert.ok(response.body.data.courses.every(course => course.instructorId === first.user.id));
  assert.ok(response.body.data.courses.every(course => course.status === 'draft'));
  assert.ok(response.body.data.courses.every(course => course.category === null));
  assert.deepEqual(response.body.data.pagination, { page: 1, limit: 2, total: 2, totalPages: 1 });

  const defaults = await request(app).get('/api/v1/instructor/courses')
    .auth(first.accessToken, { type: 'bearer' }).expect(200);
  assert.equal(defaults.body.data.pagination.page, 1);
  assert.equal(defaults.body.data.pagination.limit, 20);
  for (const query of ['status=published', 'page=0', 'limit=101', 'page=1&page=2']) {
    const invalid = await request(app).get(`/api/v1/instructor/courses?${query}`)
      .auth(first.accessToken, { type: 'bearer' });
    assert.equal(invalid.status, 400);
  }
});

test('course reads enforce ownership and draft status without exposing other courses', async () => {
  const owner = await authenticatedUser({ email: 'read-owner@example.com' });
  const outsider = await authenticatedUser({ email: 'read-outsider@example.com' });
  const activeCategory = await category();
  const created = await createCourse(owner.accessToken, courseInput(activeCategory.id));
  const courseId = created.body.data.course.id;

  await request(app).get(`/api/v1/instructor/courses/${courseId}`)
    .auth(owner.accessToken, { type: 'bearer' }).expect(200);
  const denied = await request(app).get(`/api/v1/instructor/courses/${courseId}`)
    .auth(outsider.accessToken, { type: 'bearer' });
  assert.equal(denied.status, 404);
  assert.equal(denied.body.error.code, 'COURSE_NOT_FOUND');
  const malformed = await request(app).get('/api/v1/instructor/courses/not-an-id')
    .auth(owner.accessToken, { type: 'bearer' });
  assert.equal(malformed.status, 400);

  await Course.updateOne({ _id: courseId }, { $set: { status: 'published' } });
  await request(app).get(`/api/v1/instructor/courses/${courseId}`)
    .auth(owner.accessToken, { type: 'bearer' }).expect(404);
});

test('partial updates preserve slug and protected fields while validating category and ownership', async () => {
  const owner = await authenticatedUser({ email: 'update-owner@example.com' });
  const outsider = await authenticatedUser({ email: 'update-outsider@example.com' });
  const originalCategory = await category();
  const replacementCategory = await category();
  const inactiveCategory = await category({ isActive: false });
  const created = await createCourse(owner.accessToken, courseInput(originalCategory.id));
  const course = created.body.data.course;

  const updated = await request(app).patch(`/api/v1/instructor/courses/${course.id}`)
    .auth(owner.accessToken, { type: 'bearer' })
    .send({ title: 'Updated Backend Course', categoryId: replacementCategory.id.toString() })
    .expect(200);
  assert.equal(updated.body.data.course.title, 'Updated Backend Course');
  assert.equal(updated.body.data.course.slug, course.slug);
  assert.equal(updated.body.data.course.category.id, replacementCategory.id);
  assert.equal(updated.body.data.course.instructorId, owner.user.id);

  for (const body of [{}, { status: 'published' }, { slug: 'changed' }, { coverKey: 'x' }]) {
    const invalid = await request(app).patch(`/api/v1/instructor/courses/${course.id}`)
      .auth(owner.accessToken, { type: 'bearer' }).send(body);
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');
  }
  const invalidCategoryResponse = await request(app)
    .patch(`/api/v1/instructor/courses/${course.id}`)
    .auth(owner.accessToken, { type: 'bearer' })
    .send({ categoryId: inactiveCategory.id.toString() });
  assert.equal(invalidCategoryResponse.status, 400);
  assert.equal(invalidCategoryResponse.body.error.code, 'INVALID_CATEGORY');

  const denied = await request(app).patch(`/api/v1/instructor/courses/${course.id}`)
    .auth(outsider.accessToken, { type: 'bearer' })
    .send({ categoryId: inactiveCategory.id.toString() });
  assert.equal(denied.status, 404);
  assert.equal(denied.body.error.code, 'COURSE_NOT_FOUND');
});

test('partial updates reject an existing category that became inactive until it is replaced', async () => {
  const owner = await authenticatedUser({ email: 'inactive-existing-category@example.com' });
  const originalCategory = await category();
  const replacementCategory = await category();
  const created = await createCourse(owner.accessToken, courseInput(originalCategory.id));
  await Category.updateOne({ _id: originalCategory.id }, { $set: { isActive: false } });

  const rejected = await request(app).patch(`/api/v1/instructor/courses/${created.body.data.course.id}`)
    .auth(owner.accessToken, { type: 'bearer' }).send({ title: 'A changed course title' });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.error.code, 'INVALID_CATEGORY');

  const repaired = await request(app).patch(`/api/v1/instructor/courses/${created.body.data.course.id}`)
    .auth(owner.accessToken, { type: 'bearer' })
    .send({ title: 'A changed course title', categoryId: replacementCategory.id.toString() });
  assert.equal(repaired.status, 200);
  assert.equal(repaired.body.data.course.category.id, replacementCategory.id.toString());
});

test('concurrent partial updates return category data from the committed course version', async () => {
  const owner = await authenticatedUser({ email: 'concurrent-course-update@example.com' });
  const originalCategory = await category();
  const replacementCategory = await category();
  const created = await createCourse(owner.accessToken, courseInput(originalCategory.id));
  const path = `/api/v1/instructor/courses/${created.body.data.course.id}`;

  const responses = await Promise.all([
    request(app).patch(path).auth(owner.accessToken, { type: 'bearer' })
      .send({ categoryId: replacementCategory.id.toString() }),
    request(app).patch(path).auth(owner.accessToken, { type: 'bearer' })
      .send({ title: 'Concurrently updated title' }),
  ]);

  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal(response.body.data.course.category.id, response.body.data.course.categoryId);
  }
});
