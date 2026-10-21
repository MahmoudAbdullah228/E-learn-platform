import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import mongoose from 'mongoose';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { Category } from '../src/models/Category.js';
import { Course } from '../src/models/Course.js';
import { Lesson } from '../src/models/Lesson.js';
import { MediaAsset } from '../src/models/MediaAsset.js';
import { Section } from '../src/models/Section.js';
import { User } from '../src/models/User.js';

const app = createApp({ mediaProvider: {
  publicImageUrl({ publicId, format }) {
    return `https://res.cloudinary.com/catalog-test/image/upload/${publicId}.${format}`;
  },
} });
const models = [Lesson, Section, MediaAsset, Course, Category, User];
let databaseReady = false;

before(async () => {
  await connectDatabase({ maxRetries: 1 });
  assert.match(mongoose.connection.name, /_test$/);
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

async function fixture() {
  const instructor = await User.create({
    name: 'Public Instructor', email: 'catalog-instructor@example.test',
    passwordHash: 'never-exposed-password-hash', roles: ['student', 'instructor'],
    instructorStatus: 'approved', instructorProfile: {
      bio: 'I teach practical backend engineering with clear, hands-on lessons.',
      expertise: 'Backend engineering',
      links: [{ label: 'Website', url: 'https://example.com' }],
    },
  });
  const active = await Category.create({ name: 'Engineering', slug: 'engineering' });
  const archived = await Category.create({ name: 'Archived', slug: 'archived', isActive: false });
  const now = Date.now();
  const [arabic, free, draft, unavailable] = await Course.create([
    { instructorId: instructor.id, categoryId: archived.id, title: 'تعلم البرمجة',
      slug: 'تعلم-البرمجة', description: 'A complete Arabic programming course description.',
      shortDescription: 'Arabic programming course', level: 'beginner', language: 'ar',
      priceMinor: 1500, status: 'published', publishedAt: new Date(now) },
    { instructorId: instructor.id, categoryId: active.id, title: 'Node.js Essentials',
      slug: 'node-js-essentials', description: 'A complete free Node.js course description.',
      shortDescription: 'Practical Node.js lessons', level: 'all_levels', language: 'en',
      priceMinor: 0, status: 'published', publishedAt: new Date(now - 1000) },
    { instructorId: instructor.id, categoryId: active.id, title: 'Draft Secrets',
      slug: 'draft-secrets', description: 'This unpublished draft must stay invisible.',
      priceMinor: 100, status: 'draft' },
    { instructorId: instructor.id, categoryId: active.id, title: 'Broken Course',
      slug: 'broken-course', description: 'This provider-unavailable course stays invisible.',
      priceMinor: 100, status: 'unavailable', unavailableAt: new Date() },
  ]);
  const cover = await MediaAsset.create({
    ownerId: instructor.id, purpose: 'course_cover', targetId: arabic.id,
    publicId: 'elearn/course_cover/cover-proof', resourceType: 'image',
    deliveryType: 'upload', status: 'ready', bytes: 1024, format: 'png',
    providerAssetId: 'catalog-cover-provider-id',
    expiresAt: new Date(now + 600000), providerUploadValidUntil: new Date(now + 3600000),
  });
  await Course.updateOne({ _id: arabic.id }, { $set: { coverAssetId: cover.id } });
  const section = await Section.create({ courseId: arabic.id, title: 'Intro', position: 0 });
  await Lesson.create({ sectionId: section.id, title: 'First video', description: 'Public outline',
    position: 0, durationSeconds: 120, isPreview: true, videoStatus: 'ready',
    videoAssetId: 'mux-secret-asset', videoUploadId: 'mux-secret-upload',
    attachments: [new mongoose.Types.ObjectId()] });
  return { instructor, active, archived, arabic, free, draft, unavailable };
}

test('catalog exposes only published courses in stable order with safe summaries', async () => {
  const { arabic, free } = await fixture();
  const first = await request(app).get('/api/v1/courses?limit=1').expect(200);
  assert.deepEqual(first.body.data.courses.map(course => course.id), [arabic.id]);
  assert.deepEqual(first.body.data.pagination,
    { page: 1, limit: 1, total: 2, totalPages: 2 });
  assert.equal(first.body.data.courses[0].category.slug, 'archived');
  assert.equal(first.body.data.courses[0].coverUrl,
    'https://res.cloudinary.com/catalog-test/image/upload/elearn/course_cover/cover-proof.png');
  assert.deepEqual(Object.keys(first.body.data.courses[0]).sort(), [
    'category', 'coverUrl', 'currency', 'id', 'instructor', 'language', 'level',
    'priceMinor', 'publishedAt', 'shortDescription', 'slug', 'title',
  ].sort());
  const second = await request(app).get('/api/v1/courses?page=2&limit=1').expect(200);
  assert.deepEqual(second.body.data.courses.map(course => course.id), [free.id]);
  assert.equal(second.body.data.courses[0].coverUrl, null);
});

test('catalog supports Arabic and English prefix search, category, and pricing filters', async () => {
  const { arabic, free, archived } = await fixture();
  const arabicResult = await request(app)
    .get(`/api/v1/courses?q=${encodeURIComponent('تعلم')}`).expect(200);
  assert.deepEqual(arabicResult.body.data.courses.map(course => course.id), [arabic.id]);
  const englishResult = await request(app).get('/api/v1/courses?q=NODE.').expect(200);
  assert.deepEqual(englishResult.body.data.courses.map(course => course.id), [free.id]);
  const escaped = await request(app).get('/api/v1/courses?q=Node.*').expect(200);
  assert.deepEqual(escaped.body.data.courses, []);
  const paid = await request(app).get('/api/v1/courses?pricing=paid').expect(200);
  assert.deepEqual(paid.body.data.courses.map(course => course.id), [arabic.id]);
  const freeOnly = await request(app).get('/api/v1/courses?pricing=free').expect(200);
  assert.deepEqual(freeOnly.body.data.courses.map(course => course.id), [free.id]);
  const archivedCategory = await request(app)
    .get(`/api/v1/courses?categoryId=${archived.id}`).expect(200);
  assert.deepEqual(archivedCategory.body.data.courses.map(course => course.id), [arabic.id]);
});

test('published details expose curriculum and approved profile without private media data', async () => {
  const { arabic, instructor } = await fixture();
  const result = await request(app)
    .get(`/api/v1/courses/${encodeURIComponent(arabic.slug)}`).expect(200);
  const course = result.body.data.course;
  assert.equal(course.instructor.id, instructor.id);
  assert.equal(course.instructor.bio,
    'I teach practical backend engineering with clear, hands-on lessons.');
  assert.deepEqual(course.instructor.links, [{ label: 'Website', url: 'https://example.com/' }]);
  assert.equal(course.sections[0].lessons[0].isPreview, true);
  assert.equal(course.sections[0].lessons[0].durationSeconds, 120);
  assert.equal(course.sectionCount, 1);
  assert.equal(course.lessonCount, 1);
  assert.equal(course.totalDurationSeconds, 120);
  assert.equal(course.unknownDurationCount, 0);
  for (const secret of ['passwordHash', 'email', 'videoAssetId', 'videoUploadId',
    'attachments', 'providerAssetId', 'publicId', 'mux-secret-asset']) {
    assert.equal(JSON.stringify(result.body).includes(secret), false, secret);
  }
});

test('details count the displayed curriculum only and expose incomplete duration honestly', async () => {
  const { arabic, free } = await fixture();
  const section = await Section.create({ courseId: arabic.id, title: 'Second section', position: 1 });
  await Lesson.create({ sectionId: section.id, title: 'Unknown duration', position: 0 });
  const otherSection = await Section.create({ courseId: free.id, title: 'Other course', position: 0 });
  await Lesson.create({ sectionId: otherSection.id, title: 'Other video', position: 0,
    videoStatus: 'ready', durationSeconds: 999 });
  const result = await request(app).get(`/api/v1/courses/${encodeURIComponent(arabic.slug)}`)
    .expect(200);
  const course = result.body.data.course;
  assert.equal(course.sectionCount, 2);
  assert.equal(course.lessonCount, 2);
  assert.equal(course.totalDurationSeconds, null);
  assert.equal(course.unknownDurationCount, 1);
  assert.equal(course.sectionCount, course.sections.length);
  assert.equal(course.lessonCount, course.sections.reduce((count, s) => count + s.lessons.length, 0));
});

test('details handle an empty legacy curriculum without inventing lessons or duration', async () => {
  const { free } = await fixture();
  const result = await request(app).get(`/api/v1/courses/${free.slug}`).expect(200);
  assert.equal(result.body.data.course.sectionCount, 0);
  assert.equal(result.body.data.course.lessonCount, 0);
  assert.equal(result.body.data.course.totalDurationSeconds, 0);
  assert.equal(result.body.data.course.unknownDurationCount, 0);
});

test('catalog hides an unapproved profile and a mismatched cover association', async () => {
  const { instructor, arabic } = await fixture();
  await User.updateOne({ _id: instructor.id }, { $set: { status: 'suspended' } });
  await MediaAsset.collection.updateOne({ targetId: arabic._id },
    { $set: { ownerId: new mongoose.Types.ObjectId() } });
  const result = await request(app)
    .get(`/api/v1/courses/${encodeURIComponent(arabic.slug)}`).expect(200);
  assert.equal(result.body.data.course.coverUrl, null);
  assert.equal(result.body.data.course.instructor.name, 'Public Instructor');
  assert.equal(result.body.data.course.instructor.bio, null);
  assert.deepEqual(result.body.data.course.instructor.links, []);
});

test('catalog hides nonpublished slugs and rejects unsafe query shapes', async () => {
  const { draft, unavailable } = await fixture();
  await request(app).get(`/api/v1/courses/${draft.slug}`).expect(404);
  await request(app).get(`/api/v1/courses/${unavailable.slug}`).expect(404);
  for (const query of ['page=0', 'limit=101', 'pricing=discounted', 'q=%20%20',
    'categoryId=bad', 'unexpected=1']) {
    const response = await request(app).get(`/api/v1/courses?${query}`).expect(400);
    assert.ok(response.body.error?.code);
    assert.equal(JSON.stringify(response.body).includes('stack'), false);
  }
  await request(app).get('/api/v1/courses/INVALID!').expect(400);
});

test('public details retain the published snapshot during concurrent draft edits', async t => {
  const { arabic } = await fixture();
  const originalFind = Section.find;
  let edited = false;
  t.mock.method(Section, 'find', function (...args) {
    const query = originalFind.apply(this, args);
    const originalExec = query.exec;
    query.exec = async function (...execArgs) {
      if (!edited && String(this.getFilter().courseId) === arabic.id) {
        edited = true;
        await mongoose.connection.transaction(async session => {
          await Course.updateOne({ _id: arabic.id }, { $set: { status: 'draft' },
            $inc: { curriculumRevision: 1 } }, { session });
          const sections = await originalFind.call(Section, { courseId: arabic.id })
            .session(session).lean();
          await Lesson.updateMany({ sectionId: { $in: sections.map(s => s._id) } },
            { $set: { title: 'Unreviewed draft lesson', description: 'Private draft changes',
              durationSeconds: 540 } },
            { session });
        });
      }
      return originalExec.apply(this, execArgs);
    };
    return query;
  });
  const result = await request(app).get(`/api/v1/courses/${encodeURIComponent(arabic.slug)}`)
    .expect(200);
  assert.equal(edited, true);
  assert.equal((await Course.findById(arabic.id)).status, 'draft');
  assert.equal(result.body.data.course.sections[0].lessons[0].title, 'First video');
  assert.equal(result.body.data.course.sections[0].lessons[0].description, 'Public outline');
  assert.equal(result.body.data.course.totalDurationSeconds, 120);
  await request(app).get(`/api/v1/courses/${encodeURIComponent(arabic.slug)}`).expect(404);
});
