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
import { Enrollment } from '../src/models/Enrollment.js';
import { Lesson } from '../src/models/Lesson.js';
import { LessonProgress } from '../src/models/LessonProgress.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { Section } from '../src/models/Section.js';
import { User } from '../src/models/User.js';
import { createProgressService } from '../src/modules/progress/progress.service.js';
import { signAccessToken } from '../src/utils/sessionToken.js';

const models = [LessonProgress, Enrollment, Lesson, Section, Course, Category, RefreshSession, User];
let ready = false; let app;
before(async () => {
  await connectDatabase({ maxRetries: 1 }); assert.match(mongoose.connection.name, /_test$/);
  await Promise.all(models.map(Model => Model.init())); ready = true;
});
beforeEach(async () => {
  await Promise.all(models.map(Model => Model.deleteMany({}))); app = createApp();
});
after(async () => {
  try {
    if (ready && mongoose.connection.readyState === 1) await Promise.all(models.map(Model => Model.deleteMany({})));
  } finally { await disconnectDatabase(); }
});
async function actor(email, roles = ['student']) {
  const user = await User.create({ name: 'Progress Actor', email, roles,
    instructorStatus: roles.includes('instructor') ? 'approved' : 'none',
    passwordHash: 'unused-test-hash', emailVerifiedAt: new Date() });
  const familyId = randomUUID();
  await RefreshSession.create({ userId: user.id, familyId, tokenHash: randomUUID(),
    tokenVersion: 0, expiresAt: new Date(Date.now() + 86_400_000) });
  const auth = { userId: user.id, roles, familyId, tokenVersion: 0 };
  return { user, auth, token: await signAccessToken(auth) };
}
async function fixture({ lessonCount = 2, enrolled = true, status = 'published' } = {}) {
  const student = await actor('progress-student@example.test');
  const owner = await actor('progress-owner@example.test', ['student', 'instructor']);
  const category = await Category.create({ name: 'Progress', slug: 'progress' });
  const course = await Course.create({ instructorId: owner.user.id, categoryId: category.id,
    title: 'Progress Course', slug: 'progress-course', description: 'Published course for tracking learning progress.',
    priceMinor: 0, status });
  const section = await Section.create({ courseId: course.id, title: 'First Section', position: 0 });
  const lessons = [];
  for (let i = 0; i < lessonCount; i += 1) lessons.push(await Lesson.create({ sectionId: section.id,
    title: `Lesson ${i + 1}`, position: i, videoStatus: 'ready', videoAssetId: `video-${i}`, isPreview: i === 0 }));
  const enrollment = enrolled && await Enrollment.create({ studentId: student.user.id, courseId: course.id,
    enrolledAt: new Date() });
  return { student, owner, course, section, lessons, enrollment };
}
const progressPath = (f, id = f.lessons[0].id) => `/api/v1/users/me/courses/${f.course.id}/lessons/${id}/progress`;
const lastPath = f => `/api/v1/users/me/courses/${f.course.id}/last-lesson`;
const put = (path, token, body, application = app) => request(application).put(path).auth(token, { type: 'bearer' }).send(body);
const complete = (f, value = true, id) => put(progressPath(f, id), f.student.token, { completed: value });
const outline = f => request(app).get(`/api/v1/users/me/courses/${f.course.id}`).auth(f.student.token, { type: 'bearer' });
const library = f => request(app).get('/api/v1/users/me/courses').auth(f.student.token, { type: 'bearer' });

test('completion creates one enrollment-bound record and returns safe lesson/course progress', async () => {
  const f = await fixture(); const result = await complete(f).expect(200);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(result.body.data.lessonProgress.lessonId, f.lessons[0].id);
  assert.equal(result.body.data.lessonProgress.completed, true);
  assert.deepEqual(result.body.data.progress, { totalLessons: 2, completedLessons: 1, percentage: 50, completedAt: null });
  assert.equal(result.body.data.enrollment.lastLessonId, null);
  const record = await LessonProgress.findOne();
  assert.equal(String(record.enrollmentId), f.enrollment.id); assert.equal(await LessonProgress.countDocuments(), 1);
  for (const field of ['passwordHash', 'tokenVersion', 'progressRevision', 'learningRevision', 'videoAssetId']) {
    assert.equal(JSON.stringify(result.body).includes(field), false);
  }
});

test('completed=true and completed=false are idempotent; re-completion advances only the completion date', async () => {
  const f = await fixture({ lessonCount: 1 }); const initial = new Date();
  let at = initial;
  const service = createProgressService({ clock: () => at });
  const input = { auth: f.student.auth, courseId: f.course.id, lessonId: f.lessons[0].id };
  const first = await service.setCompletion({ ...input, completed: true });
  at = new Date(initial.getTime() + 1000);
  const repeat = await service.setCompletion({ ...input, completed: true });
  assert.equal(repeat.lessonProgress.completedAt.getTime(), first.lessonProgress.completedAt.getTime());
  assert.equal(repeat.enrollment.completedAt.getTime(), first.enrollment.completedAt.getTime());
  await service.setCompletion({ ...input, completed: false });
  const falseRepeat = await service.setCompletion({ ...input, completed: false });
  assert.equal(falseRepeat.lessonProgress.completedAt, null); assert.equal(falseRepeat.enrollment.completedAt, null);
  const again = await service.setCompletion({ ...input, completed: true });
  assert.equal(again.lessonProgress.completedAt.getTime(), at.getTime());
  assert.equal(await LessonProgress.countDocuments(), 1);
});

test('whole-course completion is persisted atomically and uncomplete clears it', async () => {
  const f = await fixture(); await complete(f).expect(200);
  const done = await complete(f, true, f.lessons[1].id).expect(200);
  assert.equal(done.body.data.progress.percentage, 100);
  assert.equal(done.body.data.progress.completedAt, done.body.data.enrollment.completedAt);
  assert.equal((await Enrollment.findById(f.enrollment.id)).completedAt.toISOString(), done.body.data.progress.completedAt);
  const incomplete = await complete(f, false).expect(200);
  assert.equal(incomplete.body.data.progress.percentage, 50);
  assert.equal((await Enrollment.findById(f.enrollment.id)).completedAt, null);
});

test('last lesson is explicit, idempotent and never marks a lesson complete', async () => {
  const f = await fixture();
  const first = await put(lastPath(f), f.student.token, { lessonId: f.lessons[1].id }).expect(200);
  const repeat = await put(lastPath(f), f.student.token, { lessonId: f.lessons[1].id }).expect(200);
  assert.deepEqual(first.body, repeat.body);
  assert.equal(first.body.data.enrollment.lastLessonId, f.lessons[1].id);
  assert.equal(first.body.data.progress.completedLessons, 0);
  assert.equal(await LessonProgress.countDocuments(), 0);
});

test('concurrent same-lesson completion creates exactly one record with a stable timestamp', async () => {
  const f = await fixture({ lessonCount: 1 });
  const results = await Promise.all(Array.from({ length: 5 }, () => complete(f)));
  assert.ok(results.every(res => res.status === 200));
  assert.equal(new Set(results.map(res => res.body.data.lessonProgress.completedAt)).size, 1);
  assert.equal(await LessonProgress.countDocuments(), 1);
});

test('concurrent distinct lesson completions do not lose course completion', async () => {
  const f = await fixture({ lessonCount: 3 });
  const results = await Promise.all(f.lessons.map(lesson => complete(f, true, lesson.id)));
  assert.ok(results.every(res => res.status === 200));
  assert.equal(await LessonProgress.countDocuments({ completedAt: { $ne: null } }), 3);
  assert.ok((await Enrollment.findById(f.enrollment.id)).completedAt);
  assert.equal((await outline(f)).body.data.progress.percentage, 100);
});

test('concurrent progress and resume updates preserve both states', async () => {
  const f = await fixture();
  const results = await Promise.all([complete(f), put(lastPath(f), f.student.token, { lessonId: f.lessons[1].id })]);
  assert.ok(results.every(res => res.status === 200));
  const response = await outline(f).expect(200);
  assert.equal(response.body.data.enrollment.lastLessonId, f.lessons[1].id);
  assert.equal(response.body.data.progress.completedLessons, 1);
});

test('concurrent complete/uncomplete is serializable and enrollment matches the final record', async () => {
  const f = await fixture({ lessonCount: 1 });
  const results = await Promise.all([complete(f, true), complete(f, false)]);
  assert.ok(results.every(res => res.status === 200));
  const record = await LessonProgress.findOne(); const enrollment = await Enrollment.findById(f.enrollment.id);
  assert.equal(Boolean(enrollment.completedAt), Boolean(record.completedAt));
  assert.equal((await outline(f)).body.data.progress.percentage, record.completedAt ? 100 : 0);
});

test('progress is private to each enrollment and never affects another student', async () => {
  const f = await fixture(); const other = await actor('other-progress@example.test');
  await Enrollment.create({ studentId: other.user.id, courseId: f.course.id, enrolledAt: new Date() });
  await complete(f).expect(200);
  const otherRead = await request(app).get(`/api/v1/users/me/courses/${f.course.id}`).auth(other.token, { type: 'bearer' }).expect(200);
  assert.equal(otherRead.body.data.progress.percentage, 0);
  assert.equal(otherRead.body.data.course.sections[0].lessons[0].completed, false);
});

test('library and outline expose dynamic counts and per-lesson completion', async () => {
  const f = await fixture(); await complete(f).expect(200);
  const detail = await outline(f).expect(200); const list = await library(f).expect(200);
  assert.deepEqual(detail.body.data.progress, list.body.data.courses[0].progress);
  assert.equal(detail.body.data.course.sections[0].lessons[0].completed, true);
  assert.equal(detail.body.data.course.sections[0].lessons[1].completedAt, null);
  assert.equal(detail.body.data.enrollment.completedAt, null);
});

test('deleted lessons/sections and foreign or orphan progress never inflate the percentage', async () => {
  const f = await fixture(); await complete(f).expect(200); await complete(f, true, f.lessons[1].id).expect(200);
  await Lesson.deleteOne({ _id: f.lessons[1].id });
  const otherCourse = await Course.create({ instructorId: f.owner.user.id, categoryId: f.course.categoryId,
    title: 'Foreign Course', slug: 'foreign-progress', description: 'Another course for ownership checks.', priceMinor: 0 });
  const otherSection = await Section.create({ courseId: otherCourse.id, title: 'Foreign Section', position: 0 });
  const foreign = await Lesson.create({ sectionId: otherSection.id, title: 'Foreign Lesson', position: 0 });
  await LessonProgress.create([{ enrollmentId: f.enrollment.id, lessonId: foreign.id, completedAt: new Date() },
    { enrollmentId: f.enrollment.id, lessonId: new mongoose.Types.ObjectId(), completedAt: new Date() }]);
  const detail = await outline(f).expect(200);
  assert.equal(detail.body.data.progress.totalLessons, 1); assert.equal(detail.body.data.progress.completedLessons, 1);
  await Section.deleteOne({ _id: f.section.id });
  const zero = await outline(f).expect(200);
  assert.deepEqual(zero.body.data.progress, { totalLessons: 0, completedLessons: 0, percentage: 0, completedAt: null });
  assert.equal(zero.body.data.enrollment.completedAt, null);
});

test('new curriculum changes completion dynamically despite a stale persisted completedAt', async () => {
  const f = await fixture({ lessonCount: 1 }); await complete(f).expect(200);
  assert.ok((await Enrollment.findById(f.enrollment.id)).completedAt);
  await Lesson.create({ sectionId: f.section.id, title: 'New Lesson', position: 1 });
  const detail = await outline(f).expect(200); const list = await library(f).expect(200);
  assert.equal(detail.body.data.progress.percentage, 50); assert.equal(detail.body.data.enrollment.completedAt, null);
  assert.equal(list.body.data.courses[0].enrollment.completedAt, null);
});

test('zero lessons gives zero percent and unavailable/revoked library entries have null progress', async () => {
  const f = await fixture({ lessonCount: 0 });
  assert.equal((await outline(f)).body.data.progress.percentage, 0);
  await Course.updateOne({ _id: f.course.id }, { $set: { status: 'draft' } });
  assert.equal((await library(f)).body.data.courses[0].progress, null);
  await Course.updateOne({ _id: f.course.id }, { $set: { status: 'published' } });
  await Enrollment.updateOne({ _id: f.enrollment.id }, { $set: { status: 'revoked' } });
  const revoked = await request(app).get('/api/v1/users/me/courses?status=revoked').auth(f.student.token, { type: 'bearer' }).expect(200);
  assert.equal(revoked.body.data.courses[0].progress, null);
});

test('preview, owner and admin review access grant no progress write exemption', async () => {
  const f = await fixture({ enrolled: false }); const admin = await actor('progress-admin@example.test', ['admin']);
  await complete(f).expect(404);
  await put(lastPath(f), f.student.token, { lessonId: f.lessons[0].id }).expect(404);
  await put(progressPath(f), f.owner.token, { completed: true }).expect(404);
  await put(progressPath(f), admin.token, { completed: true }).expect(403);
  assert.equal(await LessonProgress.countDocuments(), 0);
});

test('revoked enrollment, unpublished courses and deleted or foreign lessons reject all writes', async () => {
  const f = await fixture();
  for (const id of [new mongoose.Types.ObjectId().toString()]) {
    await complete(f, true, id).expect(404); await put(lastPath(f), f.student.token, { lessonId: id }).expect(404);
  }
  const foreignSection = await Section.create({ courseId: new mongoose.Types.ObjectId(), title: 'Foreign Section', position: 0 });
  const foreign = await Lesson.create({ sectionId: foreignSection.id, title: 'Foreign Lesson', position: 0 });
  await complete(f, true, foreign.id).expect(404);
  await put(lastPath(f), f.student.token, { lessonId: foreign.id }).expect(404);
  await Enrollment.updateOne({ _id: f.enrollment.id }, { $set: { status: 'revoked' } });
  await complete(f).expect(404);
  await Enrollment.updateOne({ _id: f.enrollment.id }, { $set: { status: 'active' } });
  for (const status of ['draft', 'pending_review', 'rejected', 'unavailable']) {
    await Course.updateOne({ _id: f.course.id }, { $set: { status } });
    await complete(f).expect(409); await put(lastPath(f), f.student.token, { lessonId: f.lessons[0].id }).expect(409);
  }
  assert.equal(await LessonProgress.countDocuments(), 0);
});

test('strict body, params and query validation prevent client-selected enrollment and timestamps', async () => {
  const f = await fixture();
  for (const body of [{}, { completed: 'true' }, { completed: 1 }, { completed: null },
    { completed: true, enrollmentId: f.enrollment.id }, { completed: true, completedAt: new Date().toISOString() }]) {
    await put(progressPath(f), f.student.token, body).expect(400);
  }
  await request(app).put(progressPath(f)).auth(f.student.token, { type: 'bearer' }).expect(400);
  await put(lastPath(f), f.student.token, { lessonId: 'bad' }).expect(400);
  await put(`${progressPath(f)}?completed=true`, f.student.token, { completed: true }).expect(400);
  await put('/api/v1/users/me/courses/bad/lessons/bad/progress', f.student.token, { completed: true }).expect(400);
  await put(lastPath(f), f.student.token, { lessonId: f.lessons[0].id, completed: true }).expect(400);
  assert.equal(await LessonProgress.countDocuments(), 0);
});

test('authentication, no-store parsing errors and suspended/stale sessions are enforced', async () => {
  const f = await fixture();
  assert.equal((await request(app).put(progressPath(f)).send({ completed: true }).expect(401)).headers['cache-control'], 'no-store');
  const malformed = await request(app).put(progressPath(f)).auth(f.student.token, { type: 'bearer' })
    .set('Content-Type', 'application/json').send('{broken').expect(400);
  assert.equal(malformed.headers['cache-control'], 'no-store');
  await User.updateOne({ _id: f.student.user.id }, { $set: { status: 'suspended' } });
  await complete(f).expect(401);
  await User.updateOne({ _id: f.student.user.id }, { $set: { status: 'active' } });
  await RefreshSession.updateOne({ familyId: f.student.auth.familyId }, { $set: { revokedAt: new Date() } });
  await complete(f).expect(401); assert.equal(await LessonProgress.countDocuments(), 0);
});

test('domain service independently rechecks account and session before writes', async () => {
  const f = await fixture(); const service = createProgressService();
  const input = { auth: f.student.auth, courseId: f.course.id, lessonId: f.lessons[0].id, completed: true };
  await User.updateOne({ _id: f.student.user.id }, { $inc: { tokenVersion: 1 } });
  await assert.rejects(service.setCompletion(input), error => error.code === 'AUTHENTICATION_REQUIRED');
  await User.updateOne({ _id: f.student.user.id }, { $set: { tokenVersion: 0 } });
  await RefreshSession.updateOne({ familyId: f.student.auth.familyId }, { $set: { expiresAt: new Date(0) } });
  await assert.rejects(service.setCompletion(input), error => error.code === 'AUTHENTICATION_REQUIRED');
  assert.equal(await LessonProgress.countDocuments(), 0);
});

test('publication change between authentication and transaction fails safely with rolled-back locks', async t => {
  const f = await fixture(); const original = Course.findOneAndUpdate; let changed = false;
  t.mock.method(Course, 'findOneAndUpdate', function (...args) {
    const query = original.apply(this, args); const exec = query.exec;
    query.exec = async function (...values) {
      if (!changed) { changed = true; await Course.updateOne({ _id: f.course.id }, { $set: { status: 'unavailable' } }); }
      return exec.apply(this, values);
    }; return query;
  });
  await complete(f).expect(409);
  assert.equal(await LessonProgress.countDocuments(), 0);
  assert.equal((await Enrollment.findById(f.enrollment.id).select('+progressRevision')).progressRevision, 0);
});

test('persistence failure rolls back progress and enrollment completion with a safe error', async t => {
  const f = await fixture();
  t.mock.method(LessonProgress, 'findOneAndUpdate', () => { throw new Error('database credentials'); });
  const response = await complete(f).expect(500);
  assert.equal(JSON.stringify(response.body).includes('credentials'), false);
  assert.equal(await LessonProgress.countDocuments(), 0);
  assert.equal((await Enrollment.findById(f.enrollment.id).select('+progressRevision')).progressRevision, 0);
});

test('failure after progress insertion rolls back the record and all enrollment writes', async t => {
  const f = await fixture({ lessonCount: 1 });
  t.mock.method(Enrollment.prototype, 'save', () => { throw new Error('private database credentials'); });
  await complete(f).expect(500);
  assert.equal(await LessonProgress.countDocuments(), 0);
  const enrollment = await Enrollment.findById(f.enrollment.id).select('+progressRevision');
  assert.equal(enrollment.completedAt, null); assert.equal(enrollment.progressRevision, 0);
});

test('writes repair an invalid existing resume reference instead of returning another course lesson', async () => {
  const f = await fixture();
  await Enrollment.updateOne({ _id: f.enrollment.id }, { $set: { lastLessonId: new mongoose.Types.ObjectId() } });
  const response = await complete(f).expect(200);
  assert.equal(response.body.data.enrollment.lastLessonId, null);
  assert.equal((await Enrollment.findById(f.enrollment.id)).lastLessonId, null);
});

test('a curriculum change between aggregate queries never mixes two snapshots on reads', async t => {
  const f = await fixture({ lessonCount: 1 }); await complete(f).expect(200);
  const original = LessonProgress.aggregate; let changed = false;
  t.mock.method(LessonProgress, 'aggregate', function (...args) {
    const aggregate = original.apply(this, args); const exec = aggregate.exec;
    aggregate.exec = async function (...values) {
      if (!changed) {
        changed = true;
        await Lesson.create({ sectionId: f.section.id, title: 'Concurrent Lesson', position: 1 });
      }
      return exec.apply(this, values);
    }; return aggregate;
  });
  const originalSnapshot = await outline(f).expect(200);
  assert.equal(originalSnapshot.body.data.progress.percentage, 100);
  assert.equal(originalSnapshot.body.data.course.sections[0].lessons.length, 1);
  const current = await outline(f).expect(200);
  assert.equal(current.body.data.progress.percentage, 50);
  assert.equal(current.body.data.course.sections[0].lessons.length, 2);
});

test('database uniqueness and immutable references prevent duplicate or moved completion records', async () => {
  const f = await fixture(); await complete(f).expect(200);
  await assert.rejects(LessonProgress.create({ enrollmentId: f.enrollment.id, lessonId: f.lessons[0].id }),
    error => error.code === 11000);
  await assert.rejects(LessonProgress.updateOne({}, { $set: { enrollmentId: new mongoose.Types.ObjectId() } }));
  await assert.rejects(LessonProgress.updateOne({}, { $rename: { lessonId: 'otherLesson' } }));
  assert.equal(String((await LessonProgress.findOne()).enrollmentId), f.enrollment.id);
});

test('a single user-wide progress quota spans completion, resume and all course IDs', async () => {
  const f = await fixture(); const hits = new Map();
  const limited = createApp({ rateLimitStoreFactory: name => name !== 'learning-progress' ? undefined : {
    localKeys: true, async increment(key) {
      const totalHits = (hits.get(key) ?? env.LEARNING_PROGRESS_RATE_LIMIT_MAX - 1) + 1;
      hits.set(key, totalHits); return { totalHits, resetTime: new Date(Date.now() + 60_000) };
    }, async decrement() {}, async resetKey() {},
  } });
  await put(progressPath(f), f.student.token, { completed: true }, limited).expect(200);
  const denied = await put(lastPath(f), f.student.token, { lessonId: f.lessons[0].id }, limited).expect(429);
  assert.equal(denied.body.error.code, 'RATE_LIMITED'); assert.ok(denied.headers['retry-after']);
  await put(`/api/v1/users/me/courses/${new mongoose.Types.ObjectId()}/last-lesson`, f.student.token,
    { lessonId: f.lessons[0].id }, limited).expect(429);
  assert.equal((await Enrollment.findById(f.enrollment.id)).lastLessonId, null);
  assert.deepEqual([...hits.keys()], [f.student.user.id]);
});

test('progress quota is separate from private reads and shared-store failure fails closed', async () => {
  const f = await fixture();
  const failed = createApp({ rateLimitStoreFactory: name => name !== 'learning-progress' ? undefined : {
    localKeys: true, async increment() { throw new Error('redis password'); }, async decrement() {}, async resetKey() {},
  } });
  for (const [path, body] of [[progressPath(f), { completed: true }], [lastPath(f), { lessonId: f.lessons[0].id }]]) {
    const response = await put(path, f.student.token, body, failed).expect(503);
    assert.equal(response.body.error.code, 'RATE_LIMIT_UNAVAILABLE');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(JSON.stringify(response.body).includes('password'), false);
  }
  await request(failed).get(`/api/v1/users/me/courses/${f.course.id}`).auth(f.student.token, { type: 'bearer' }).expect(200);
  assert.equal(await LessonProgress.countDocuments(), 0);
});
