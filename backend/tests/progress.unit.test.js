import assert from 'node:assert/strict';
import test from 'node:test';

import { LessonProgress } from '../src/models/LessonProgress.js';
import { toLessonProgress, toProgressSummary } from '../src/modules/progress/progress.presenter.js';
import { completionBodySchema, lastLessonBodySchema, lessonProgressParamsSchema } from '../src/modules/progress/progress.schemas.js';

test('progress schemas require real booleans, normalize IDs and reject mass assignment', () => {
  assert.deepEqual(completionBodySchema.parse({ completed: false }), { completed: false });
  for (const input of [undefined, {}, { completed: 'false' }, { completed: 0 }, { completed: true, studentId: 'x' }]) {
    assert.equal(completionBodySchema.safeParse(input).success, false);
  }
  const id = 'ABCDEF0123456789ABCDEF01';
  assert.equal(lastLessonBodySchema.parse({ lessonId: id }).lessonId, id.toLowerCase());
  assert.equal(lessonProgressParamsSchema.safeParse({ courseId: id, lessonId: 'invalid' }).success, false);
});

test('percentages use current counts, floor to two decimals and never report incomplete 100 percent', () => {
  assert.equal(toProgressSummary({ totalLessons: 3, completedLessons: 2 }).percentage, 66.66);
  assert.equal(toProgressSummary({ totalLessons: 40000, completedLessons: 39999 }).percentage, 99.99);
  assert.equal(toProgressSummary({ totalLessons: 100, completedLessons: 57 }).percentage, 57);
  assert.equal(toProgressSummary({ totalLessons: Number.MAX_SAFE_INTEGER,
    completedLessons: Number.MAX_SAFE_INTEGER - 1 }).percentage, 99.99);
  assert.equal(toProgressSummary({ totalLessons: 0, completedLessons: 0 }).percentage, 0);
  assert.equal(toProgressSummary({ totalLessons: 2, completedLessons: 1, completedAt: new Date() }).completedAt, null);
  assert.throws(() => toProgressSummary({ totalLessons: 1, completedLessons: 2 }), TypeError);
});

test('lesson progress DTO allowlists only lesson ID, completion and timestamp', () => {
  const dto = toLessonProgress({ lessonId: 'lesson', enrollmentId: 'private', completedAt: null, studentId: 'private' });
  assert.deepEqual(dto, { lessonId: 'lesson', completed: false, completedAt: null });
});

test('progress model has immutable enrollment/lesson references, unique pair and no history TTL', () => {
  assert.ok(LessonProgress.schema.indexes().some(([fields, options]) =>
    fields.enrollmentId === 1 && fields.lessonId === 1 && options.unique));
  assert.equal(LessonProgress.schema.indexes().some(([, options]) => options.expireAfterSeconds != null), false);
  for (const name of ['enrollmentId', 'lessonId']) assert.equal(LessonProgress.schema.path(name).options.immutable, true);
});
