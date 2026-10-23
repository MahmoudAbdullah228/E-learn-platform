import { Course } from '../models/Course.js';
import { InstructorApplication } from '../models/InstructorApplication.js';
import { Lesson } from '../models/Lesson.js';
import { User } from '../models/User.js';
import { normalizeSearchText } from '../utils/searchText.js';

function missingOrNull(document, field) {
  return !Object.hasOwn(document, field) || document[field] === null;
}

function fieldCondition(field, value) {
  return value === undefined ? { [field]: { $exists: false } } : { [field]: value };
}

async function migrateCollection({ collection, buildUpdate, apply, batchSize }) {
  let candidates = 0;
  let modified = 0;
  let operations = [];

  async function flush() {
    if (!apply || operations.length === 0) {
      operations = [];
      return;
    }
    const result = await collection.bulkWrite(operations, { ordered: false });
    modified += result.modifiedCount;
    operations = [];
  }

  for await (const document of collection.find({})) {
    const update = buildUpdate(document);
    if (!update) continue;
    candidates += 1;
    operations.push({ updateOne: update });
    if (operations.length >= batchSize) await flush();
  }
  await flush();
  return { candidates, modified: apply ? modified : 0 };
}

function courseUpdate(course) {
  const set = {};
  const conditions = [];
  for (const [field, fallback, acceptsNull] of [
    ['shortDescription', '', false], ['level', null, true], ['language', null, true],
  ]) {
    if (!Object.hasOwn(course, field) || (!acceptsNull && course[field] === null)) {
      set[field] = fallback;
      conditions.push(fieldCondition(field, course[field]));
    }
  }

  const titleSearch = normalizeSearchText(course.title);
  if (course.titleSearch !== titleSearch) {
    set.titleSearch = titleSearch;
    conditions.push(fieldCondition('titleSearch', course.titleSearch));
  }
  if (conditions.length === 0) return null;
  return { filter: { _id: course._id, $and: conditions }, update: { $set: set } };
}

function defaultArrayUpdate(field) {
  return document => {
    if (!missingOrNull(document, field)) return null;
    return {
      filter: { _id: document._id, ...fieldCondition(field, document[field]) },
      update: { $set: { [field]: [] } },
    };
  };
}

function lessonUpdate(lesson) {
  if (!missingOrNull(lesson, 'description')) return null;
  return {
    filter: { _id: lesson._id, ...fieldCondition('description', lesson.description) },
    update: { $set: { description: '' } },
  };
}

function userUpdate(user) {
  if (!user.instructorProfile || Array.isArray(user.instructorProfile.links)) return null;
  return {
    filter: {
      _id: user._id,
      ...fieldCondition('instructorProfile.links', user.instructorProfile.links),
    },
    update: { $set: { 'instructorProfile.links': [] } },
  };
}

export async function migrateSprint2Content({ apply = false, batchSize = 500 } = {}) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 5000) {
    throw new TypeError('Migration batchSize must be an integer from 1 through 5000');
  }

  const [courses, lessons, applications, users] = await Promise.all([
    migrateCollection({
      collection: Course.collection, buildUpdate: courseUpdate, apply, batchSize,
    }),
    migrateCollection({
      collection: Lesson.collection, buildUpdate: lessonUpdate, apply, batchSize,
    }),
    migrateCollection({
      collection: InstructorApplication.collection,
      buildUpdate: defaultArrayUpdate('links'),
      apply,
      batchSize,
    }),
    migrateCollection({
      collection: User.collection, buildUpdate: userUpdate, apply, batchSize,
    }),
  ]);
  const results = { courses, lessons, applications, users };
  return {
    mode: apply ? 'apply' : 'dry-run',
    ...results,
    totalCandidates: Object.values(results)
      .reduce((total, result) => total + result.candidates, 0),
    totalModified: Object.values(results)
      .reduce((total, result) => total + result.modified, 0),
  };
}
