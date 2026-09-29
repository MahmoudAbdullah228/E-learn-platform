import mongoose from 'mongoose';

import { Course } from '../../models/Course.js';
import { Section } from '../../models/Section.js';
import { Lesson } from '../../models/Lesson.js';
import { enqueueVideoCleanup } from '../../services/videoCleanupQueue.service.js';
import { ApiError } from '../../utils/ApiError.js';

const MAX_CHILDREN = 200;
const transactionOptions = { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } };

function notFound() {
  return new ApiError(404, 'CURRICULUM_NOT_FOUND', 'Draft course content was not found');
}

function toLesson(lesson) {
  return {
    id: lesson._id.toString(), sectionId: lesson.sectionId.toString(),
    title: lesson.title, position: lesson.position, isPreview: lesson.isPreview,
    videoStatus: lesson.videoStatus, durationSeconds: lesson.durationSeconds,
    createdAt: lesson.createdAt, updatedAt: lesson.updatedAt,
  };
}

function toSection(section) {
  return {
    id: section._id.toString(), courseId: section.courseId.toString(),
    title: section.title, position: section.position,
    createdAt: section.createdAt, updatedAt: section.updatedAt,
  };
}

async function ownedCourse(courseId, instructorId, session, { lock = true } = {}) {
  const filter = { _id: courseId, instructorId, status: 'draft' };
  const course = lock
    ? await Course.findOneAndUpdate(filter, { $inc: { curriculumRevision: 1 } }, { session })
    : await Course.findOne(filter).session(session).lean();
  if (!course) throw notFound();
}

async function ownedSection(sectionId, instructorId, session) {
  const section = await Section.findById(sectionId).session(session).lean();
  if (!section) throw notFound();
  await ownedCourse(section.courseId, instructorId, session);
  return section;
}

async function ownedLesson(lessonId, instructorId, session) {
  const lesson = await Lesson.findById(lessonId)
    .select('+videoUploadId +videoAssetId').session(session).lean();
  if (!lesson) throw notFound();
  await ownedSection(lesson.sectionId, instructorId, session);
  return lesson;
}

async function children(Model, filter, session) {
  return Model.find(filter).sort({ position: 1, _id: 1 }).session(session).lean();
}

async function append(Model, filter, input, session) {
  const existing = await children(Model, filter, session);
  if (existing.length >= MAX_CHILDREN) {
    throw new ApiError(409, 'CURRICULUM_LIMIT_REACHED', 'A parent can contain at most 200 items');
  }
  const position = existing.length ? existing.at(-1).position + 1 : 0;
  const [document] = await Model.create([{ ...filter, ...input, position }], { session });
  return document;
}

async function setPositions(Model, filter, orderedIds, session) {
  if (!orderedIds.length) return;
  await Model.bulkWrite(orderedIds.map((_id, position) => ({
    updateOne: { filter: { ...filter, _id }, update: { $set: { position } } },
  })), { session, ordered: true });
}

async function reorder(Model, filter, orderedIds, session) {
  const existing = await children(Model, filter, session);
  const ids = new Set(existing.map(item => item._id.toString()));
  if (ids.size !== orderedIds.length || new Set(orderedIds).size !== orderedIds.length
      || orderedIds.some(id => !ids.has(id))) {
    throw new ApiError(409, 'INVALID_CURRICULUM_ORDER',
      'orderedIds must contain every current item exactly once; reload and retry');
  }
  await setPositions(Model, filter, orderedIds, session);
  return children(Model, filter, session);
}

async function compact(Model, filter, session) {
  const remaining = await children(Model, filter, session);
  await setPositions(Model, filter, remaining.map(item => item._id.toString()), session);
}

export function createCurriculumService() {
  // The driver retries transient write conflicts. All writers lock the same parent course,
  // including when resolving a lesson indirectly; no process-local lock is required.
  const transaction = work => mongoose.connection.transaction(work, transactionOptions);
  return Object.freeze({
    async listSections({ courseId, instructorId }) {
      return transaction(async session => {
        await ownedCourse(courseId, instructorId, session, { lock: false });
        const sections = await children(Section, { courseId }, session);
        const lessons = await children(Lesson, { sectionId: { $in: sections.map(s => s._id) } }, session);
        const bySection = new Map(sections.map(s => [s._id.toString(), []]));
        for (const lesson of lessons) bySection.get(lesson.sectionId.toString()).push(toLesson(lesson));
        return { sections: sections.map(section => ({
          ...toSection(section), lessons: bySection.get(section._id.toString()),
        })) };
      });
    },

    async createSection({ courseId, instructorId, input }) {
      return transaction(async session => {
        await ownedCourse(courseId, instructorId, session);
        return { section: toSection(await append(Section, { courseId }, input, session)) };
      });
    },

    async updateSection({ courseId, sectionId, instructorId, input }) {
      return transaction(async session => {
        await ownedCourse(courseId, instructorId, session);
        const section = await Section.findOneAndUpdate({ _id: sectionId, courseId },
          { $set: input }, { session, returnDocument: 'after', runValidators: true });
        if (!section) throw notFound();
        return { section: toSection(section) };
      });
    },

    async deleteSection({ courseId, sectionId, instructorId }) {
      return transaction(async session => {
        await ownedCourse(courseId, instructorId, session);
        const section = await Section.findOneAndDelete({ _id: sectionId, courseId }, { session });
        if (!section) throw notFound();
        const lessons = await Lesson.find({ sectionId })
          .select('+videoUploadId +videoAssetId').session(session).lean();
        await enqueueVideoCleanup(lessons, session);
        await Lesson.deleteMany({ sectionId }, { session });
        await compact(Section, { courseId }, session);
        return { deletedId: sectionId };
      });
    },

    async reorderSections({ courseId, instructorId, input }) {
      return transaction(async session => {
        await ownedCourse(courseId, instructorId, session);
        const sections = await reorder(Section, { courseId }, input.orderedIds, session);
        return { sections: sections.map(toSection) };
      });
    },

    async createLesson({ sectionId, instructorId, input }) {
      return transaction(async session => {
        await ownedSection(sectionId, instructorId, session);
        return { lesson: toLesson(await append(Lesson, { sectionId }, input, session)) };
      });
    },

    async updateLesson({ lessonId, instructorId, input }) {
      return transaction(async session => {
        await ownedLesson(lessonId, instructorId, session);
        const lesson = await Lesson.findByIdAndUpdate(lessonId, { $set: input },
          { session, returnDocument: 'after', runValidators: true });
        if (!lesson) throw notFound();
        return { lesson: toLesson(lesson) };
      });
    },

    async deleteLesson({ lessonId, instructorId }) {
      return transaction(async session => {
        const lesson = await ownedLesson(lessonId, instructorId, session);
        await enqueueVideoCleanup([lesson], session);
        await Lesson.deleteOne({ _id: lessonId }, { session });
        await compact(Lesson, { sectionId: lesson.sectionId }, session);
        return { deletedId: lessonId };
      });
    },

    async reorderLessons({ sectionId, instructorId, input }) {
      return transaction(async session => {
        await ownedSection(sectionId, instructorId, session);
        const lessons = await reorder(Lesson, { sectionId }, input.orderedIds, session);
        return { lessons: lessons.map(toLesson) };
      });
    },
  });
}
