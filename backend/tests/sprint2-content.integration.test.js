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
import { InstructorApplication } from '../src/models/InstructorApplication.js';
import { Lesson } from '../src/models/Lesson.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { Section } from '../src/models/Section.js';
import { User } from '../src/models/User.js';
import { createSessionService } from '../src/modules/auth/session.service.js';
import { migrateSprint2Content } from '../src/services/sprint2ContentMigration.service.js';

const app = createApp();
const password = 'correct horse battery staple';
const bio = 'I teach production backend engineering with practical architecture and testing.';
let databaseReady = false;

before(async () => {
  await connectDatabase({ maxRetries: 1 });
  assert.match(mongoose.connection.name, /_test$/);
  await assertTransactionSupport();
  await Promise.all([
    User.init(), RefreshSession.init(), InstructorApplication.init(), Category.init(),
    Course.init(), Section.init(), Lesson.init(),
  ]);
  databaseReady = true;
});

beforeEach(async () => {
  await Promise.all([
    Lesson.deleteMany({}), Section.deleteMany({}), Course.deleteMany({}), Category.deleteMany({}),
    InstructorApplication.deleteMany({}), RefreshSession.deleteMany({}), User.deleteMany({}),
  ]);
});

after(async () => {
  try {
    if (databaseReady && mongoose.connection.readyState === 1) {
      await Promise.all([
        Lesson.deleteMany({}), Section.deleteMany({}), Course.deleteMany({}),
        Category.deleteMany({}), InstructorApplication.deleteMany({}),
        RefreshSession.deleteMany({}), User.deleteMany({}),
      ]);
    }
  } finally {
    await disconnectDatabase();
  }
});

async function account({ email, roles = ['student'], instructorStatus = 'none', profile }) {
  const user = await User.create({
    name: 'Sprint Two User',
    email,
    passwordHash: await bcrypt.hash(password, 10),
    roles,
    instructorStatus,
    instructorProfile: profile,
    emailVerifiedAt: new Date(),
  });
  const session = await createSessionService().login({ email, password });
  return { user, token: session.accessToken };
}

const authorized = (method, path, token) => request(app)[method](path)
  .auth(token, { type: 'bearer' });

test('approved application links become public and later profile edits stay historical', async () => {
  const student = await account({ email: 'links-student@example.test' });
  const admin = await account({ email: 'links-admin@example.test', roles: ['admin'] });
  const submitted = await authorized('post', '/api/v1/instructor-applications', student.token)
    .send({
      bio,
      expertise: 'Node.js and MongoDB',
      links: [{ label: ' Portfolio ', url: 'https://EXAMPLE.com:443/work' }],
    })
    .expect(201);

  const application = submitted.body.data.application;
  assert.deepEqual(application.links, [{
    label: 'Portfolio', url: 'https://example.com/work',
  }]);

  await authorized(
    'patch', `/api/v1/admin/instructor-applications/${application.id}`, admin.token,
  ).send({ status: 'approved' }).expect(200);

  const publicProfile = await request(app)
    .get(`/api/v1/instructors/${student.user.id}`).expect(200);
  assert.equal(publicProfile.headers['cache-control'], 'public, max-age=60');
  assert.deepEqual(publicProfile.body.data.instructor, {
    id: student.user.id,
    name: 'Sprint Two User',
    avatarAssetId: null,
    avatarUrl: null,
    bio,
    expertise: 'Node.js and MongoDB',
    links: [{ label: 'Portfolio', url: 'https://example.com/work' }],
  });
  assert.equal('email' in publicProfile.body.data.instructor, false);

  const edited = await authorized('patch', '/api/v1/instructor/profile', student.token)
    .send({ bio: `${bio} Updated safely.` })
    .expect(200);
  assert.equal(edited.body.data.instructor.expertise, 'Node.js and MongoDB');
  assert.equal(edited.body.data.instructor.links.length, 1);

  const cleared = await authorized('patch', '/api/v1/instructor/profile', student.token)
    .send({ links: [] })
    .expect(200);
  assert.deepEqual(cleared.body.data.instructor.links, []);

  const historical = await authorized(
    'get', '/api/v1/instructor-applications/me', student.token,
  ).expect(200);
  assert.deepEqual(historical.body.data.application.links, [{
    label: 'Portfolio', url: 'https://example.com/work',
  }]);
});

test('instructor links reject unsafe, credentialed, duplicate, excessive, and null values', async () => {
  const student = await account({ email: 'invalid-links@example.test' });
  const payloads = [
    [{ label: 'Expanded Arabic URL', url: `https://example.com/${'ع'.repeat(400)}` }],
    [{ label: 'HTTP', url: 'http://example.com' }],
    [{ label: 'Credentials', url: 'https://user:secret@example.com' }],
    [
      { label: 'One', url: 'https://example.com' },
      { label: 'Duplicate', url: 'https://EXAMPLE.com:443/' },
    ],
    Array.from({ length: 6 }, (_, index) => ({
      label: `Link ${index}`, url: `https://example.com/${index}`,
    })),
    null,
  ];

  for (const links of payloads) {
    const response = await authorized('post', '/api/v1/instructor-applications', student.token)
      .send({ bio, expertise: 'Backend', links });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  }
  assert.equal(await InstructorApplication.countDocuments(), 0);

  await assert.rejects(InstructorApplication.create({
    userId: student.user.id,
    bio,
    expertise: 'Backend',
    links: [{ label: 'Unsafe', url: 'http://example.com' }],
  }), error => error.name === 'ValidationError');

  await assert.rejects(User.create({
    name: 'Invalid Links User',
    email: 'direct-invalid-links@example.test',
    passwordHash: 'hash',
    roles: ['student', 'instructor'],
    instructorStatus: 'approved',
    instructorProfile: {
      bio,
      expertise: 'Backend',
      links: [
        { label: 'One', url: 'https://example.com' },
        { label: 'Duplicate', url: 'https://EXAMPLE.com:443/' },
      ],
    },
  }), error => error.name === 'ValidationError');
});

test('rejected links remain on the application and never create a public profile', async () => {
  const student = await account({ email: 'rejected-links@example.test' });
  const admin = await account({ email: 'rejecting-admin@example.test', roles: ['admin'] });
  const submitted = await authorized('post', '/api/v1/instructor-applications', student.token)
    .send({
      bio,
      expertise: 'Backend',
      links: [{ label: 'Work', url: 'https://work.example.test' }],
    }).expect(201);

  await authorized(
    'patch', `/api/v1/admin/instructor-applications/${submitted.body.data.application.id}`,
    admin.token,
  ).send({ status: 'rejected', rejectionReason: 'More experience evidence is required.' })
    .expect(200);

  const user = await User.findById(student.user.id).lean();
  assert.equal(user.instructorProfile, undefined);
  const rejectedProfile = await request(app)
    .get(`/api/v1/instructors/${student.user.id}`).expect(404);
  assert.notEqual(rejectedProfile.headers['cache-control'], 'public, max-age=60');
  const application = await InstructorApplication.findById(
    submitted.body.data.application.id,
  ).lean();
  assert.equal(application.links[0].url, 'https://work.example.test/');
});

test('public profiles require an active approved instructor and support legacy empty links', async () => {
  const legacy = await account({
    email: 'legacy-instructor@example.test',
    roles: ['student', 'instructor'],
    instructorStatus: 'approved',
    profile: { bio, expertise: 'Legacy backend expertise' },
  });
  const response = await request(app).get(`/api/v1/instructors/${legacy.user.id}`).expect(200);
  assert.deepEqual(response.body.data.instructor.links, []);

  await User.updateOne({ _id: legacy.user.id }, { $set: { status: 'suspended' } });
  await request(app).get(`/api/v1/instructors/${legacy.user.id}`).expect(404);

  const student = await account({ email: 'not-instructor@example.test' });
  await request(app).get(`/api/v1/instructors/${student.user.id}`).expect(404);
  await authorized('patch', '/api/v1/instructor/profile', student.token)
    .send({ bio }).expect(403);
});

test('profile update rejects empty bodies and requires complete initialization for legacy users', async () => {
  const instructor = await account({
    email: 'profile-validation@example.test',
    roles: ['student', 'instructor'],
    instructorStatus: 'approved',
  });

  await authorized('patch', '/api/v1/instructor/profile', instructor.token)
    .send({}).expect(400);
  const incomplete = await authorized('patch', '/api/v1/instructor/profile', instructor.token)
    .send({ links: [] }).expect(409);
  assert.equal(incomplete.body.error.code, 'INSTRUCTOR_PROFILE_INCOMPLETE');

  const initialized = await authorized('patch', '/api/v1/instructor/profile', instructor.token)
    .send({ bio, expertise: 'New instructor expertise', links: [] }).expect(200);
  assert.equal(initialized.body.data.instructor.bio, bio);
});

test('course and lesson content fields persist safely with backward-compatible defaults', async () => {
  const instructor = await account({
    email: 'content-owner@example.test',
    roles: ['student', 'instructor'],
    instructorStatus: 'approved',
    profile: { bio, expertise: 'Backend content' },
  });
  const category = await Category.create({ name: 'Backend', slug: 'backend' });
  const created = await authorized('post', '/api/v1/instructor/courses', instructor.token)
    .send({
      title: '  بناء Backend نظيف  ',
      categoryId: category.id,
      description: 'وصف كامل للكورس يشرح المحتوى العملي والمعماري بصورة واضحة.',
      shortDescription: 'رحلة عملية لبناء خدمات خلفية قابلة للصيانة.',
      level: 'intermediate',
      language: 'ar',
      priceMinor: 25000,
      currency: 'EGP',
    }).expect(201);
  const course = created.body.data.course;
  assert.equal(course.shortDescription, 'رحلة عملية لبناء خدمات خلفية قابلة للصيانة.');
  assert.equal(course.level, 'intermediate');
  assert.equal(course.language, 'ar');

  const stored = await Course.findById(course.id).select('+titleSearch').lean();
  assert.equal(stored.titleSearch, 'بناء backend نظيف');
  await Course.updateOne({ _id: course.id }, { $set: { title: '  UPDATED   API Course  ' } });
  const updatedSearch = await Course.findById(course.id).select('+titleSearch').lean();
  assert.equal(updatedSearch.titleSearch, 'updated api course');

  const section = await authorized(
    'post', `/api/v1/instructor/courses/${course.id}/sections`, instructor.token,
  ).send({ title: 'Introduction' }).expect(201);
  const lesson = await authorized(
    'post', `/api/v1/instructor/sections/${section.body.data.section.id}/lessons`,
    instructor.token,
  ).send({
    title: 'Architecture boundaries',
    description: 'Controllers handle HTTP.\nServices own business rules.',
    isPreview: true,
  }).expect(201);
  assert.equal(lesson.body.data.lesson.description,
    'Controllers handle HTTP.\nServices own business rules.');

  const legacy = await Course.create({
    instructorId: instructor.user.id,
    categoryId: category.id,
    title: 'Legacy Course',
    slug: 'legacy-course',
    description: 'A legacy draft that predates the Sprint 2 content fields.',
    priceMinor: 0,
  });
  const legacyResponse = await authorized(
    'get', `/api/v1/instructor/courses/${legacy.id}`, instructor.token,
  ).expect(200);
  assert.equal(legacyResponse.body.data.course.shortDescription, '');
  assert.equal(legacyResponse.body.data.course.level, null);
  assert.equal(legacyResponse.body.data.course.language, null);
});

test('new course and lesson fields reject invalid values at HTTP and model boundaries', async () => {
  const instructor = await account({
    email: 'invalid-content@example.test',
    roles: ['student', 'instructor'],
    instructorStatus: 'approved',
    profile: { bio, expertise: 'Backend content' },
  });
  const category = await Category.create({ name: 'APIs', slug: 'apis' });
  const base = {
    title: 'API Design',
    categoryId: category.id,
    description: 'A sufficiently detailed description for this draft API course.',
    priceMinor: 0,
  };
  await authorized('post', '/api/v1/instructor/courses', instructor.token)
    .send({ ...base, shortDescription: 'short' }).expect(400);
  await authorized('post', '/api/v1/instructor/courses', instructor.token)
    .send({ ...base, level: 'expert' }).expect(400);

  await assert.rejects(Course.create({
    instructorId: instructor.user.id,
    categoryId: category.id,
    title: 'Unsafe Short Description',
    slug: 'unsafe-short-description',
    description: base.description,
    shortDescription: 'unsafe\u0000description',
    priceMinor: 0,
  }), error => error.name === 'ValidationError');

  await assert.rejects(Lesson.create({
    sectionId: new mongoose.Types.ObjectId(),
    title: 'Unsafe lesson',
    description: 'unsafe\u0000description',
    position: 0,
  }), error => error.name === 'ValidationError');
});

test('content migration is dry-run by default, concurrency-safe, and idempotent', async () => {
  const instructor = await account({
    email: 'migration-instructor@example.test',
    roles: ['student', 'instructor'],
    instructorStatus: 'approved',
    profile: { bio, expertise: 'Migration expertise' },
  });
  const category = await Category.create({ name: 'Migration', slug: 'migration' });
  const course = await Course.create({
    instructorId: instructor.user.id,
    categoryId: category.id,
    title: '  Legacy   Search Title  ',
    slug: 'legacy-search-title',
    description: 'A legacy course used to verify the idempotent migration path.',
    priceMinor: 0,
  });
  const section = await Section.create({ courseId: course.id, title: 'Legacy', position: 0 });
  const lesson = await Lesson.create({ sectionId: section.id, title: 'Legacy lesson', position: 0 });
  const application = await InstructorApplication.create({
    userId: instructor.user.id,
    bio,
    expertise: 'Migration expertise',
    status: 'approved',
  });

  await Promise.all([
    Course.collection.updateOne({ _id: course._id }, {
      $unset: { shortDescription: '', level: '', language: '', titleSearch: '' },
    }),
    Lesson.collection.updateOne({ _id: lesson._id }, { $unset: { description: '' } }),
    InstructorApplication.collection.updateOne({ _id: application._id }, { $unset: { links: '' } }),
    User.collection.updateOne(
      { _id: instructor.user._id }, { $unset: { 'instructorProfile.links': '' } },
    ),
  ]);

  const dryRun = await migrateSprint2Content();
  assert.equal(dryRun.mode, 'dry-run');
  assert.equal(dryRun.totalCandidates, 4);
  assert.equal(dryRun.totalModified, 0);
  const untouched = await Course.collection.findOne({ _id: course._id });
  assert.equal(Object.hasOwn(untouched, 'titleSearch'), false);

  const applied = await migrateSprint2Content({ apply: true, batchSize: 2 });
  assert.equal(applied.totalCandidates, 4);
  assert.equal(applied.totalModified, 4);
  const [migratedCourse, migratedLesson, migratedApplication, migratedUser] = await Promise.all([
    Course.collection.findOne({ _id: course._id }),
    Lesson.collection.findOne({ _id: lesson._id }),
    InstructorApplication.collection.findOne({ _id: application._id }),
    User.collection.findOne({ _id: instructor.user._id }),
  ]);
  assert.equal(migratedCourse.shortDescription, '');
  assert.equal(migratedCourse.level, null);
  assert.equal(migratedCourse.language, null);
  assert.equal(migratedCourse.titleSearch, 'legacy search title');
  assert.equal(migratedLesson.description, '');
  assert.deepEqual(migratedApplication.links, []);
  assert.deepEqual(migratedUser.instructorProfile.links, []);

  const repeated = await migrateSprint2Content({ apply: true });
  assert.equal(repeated.totalCandidates, 0);
  assert.equal(repeated.totalModified, 0);
});
