import mongoose from 'mongoose';

import { RevisionLesson, RevisionSection } from '../../models/CourseRevision.js';
import { cleanupCandidateMedia, cleanupCandidateVideos } from './revisionMediaCleanup.service.js';
import { ApiError } from '../../utils/ApiError.js';

const missing = () => new ApiError(404, 'REVISION_NOT_FOUND', 'Course revision content was not found');

async function requireSection(revisionId, logicalId, session) {
  if (!await RevisionSection.exists({ revisionId, logicalId }).session(session)) throw missing();
}

export function curriculumEdit(Model, action) {
  return async (row, session, { sectionId, lessonId, input }) => {
    const parent = { revisionId: row._id };
    if (Model === RevisionLesson && sectionId) {
      await requireSection(row._id, sectionId, session);
      parent.sectionId = sectionId;
    }
    const { expectedRevision, ...fields } = input;
    void expectedRevision;
    if (action === 'create') {
      if (await Model.countDocuments(parent).session(session) >= 200) {
        throw new ApiError(409, 'CURRICULUM_LIMIT_REACHED', 'A parent can contain at most 200 items');
      }
      const last = await Model.findOne(parent).sort({ position: -1 }).select('position').session(session);
      const logicalId = new mongoose.Types.ObjectId();
      await Model.create([{ ...parent, ...fields, logicalId, position: (last?.position ?? -1) + 1 }], { session });
      return { logicalId };
    }
    if (action === 'reorder') {
      const items = await Model.find(parent).select('logicalId position').session(session).lean();
      const ids = new Set(items.map(item => String(item.logicalId)));
      if (ids.size !== fields.orderedIds.length || fields.orderedIds.some(id => !ids.has(id))) {
        throw new ApiError(409, 'INVALID_CURRICULUM_ORDER', 'Supply all current child IDs');
      }
      if (items.length) {
        const offset = Math.max(...items.map(item => item.position)) + 1;
        await Model.updateMany(parent, { $inc: { position: offset } }, { session });
        await Model.bulkWrite(fields.orderedIds.map((logicalId, position) => ({
          updateOne: { filter: { ...parent, logicalId }, update: { $set: { position } } },
        })), { session });
      }
      return;
    }
    const target = { ...parent, logicalId: lessonId ?? sectionId };
    if (action === 'remove') {
      await cleanupCandidateVideos(row._id, session, Model === RevisionLesson ? { logicalId: lessonId } : { sectionId });
      if (!(await Model.deleteOne(target, { session })).deletedCount) throw missing();
      const lessonIds = Model === RevisionSection
        ? await RevisionLesson.distinct('logicalId', { revisionId: row._id, sectionId }).session(session) : [lessonId];
      await cleanupCandidateMedia(row._id, session, { purpose: 'lesson_attachment', targetId: { $in: lessonIds } });
      if (Model === RevisionSection) await RevisionLesson.deleteMany({ revisionId: row._id, sectionId }, { session });
    } else if (!(await Model.updateOne(target, { $set: fields }, { session, runValidators: true })).matchedCount) {
      throw missing();
    }
  };
}

export function listRevisionChildren(Model) {
  return async (row, session, { sectionId, after }) => {
    const filter = { revisionId: row._id };
    if (sectionId) {
      await requireSection(row._id, sectionId, session);
      filter.sectionId = sectionId;
    }
    if (after !== undefined) filter.position = { $gt: after };
    const rows = await Model.find(filter).select('-_id logicalId title position description isPreview attachments videoStatus durationSeconds')
      .sort({ position: 1 }).limit(51).session(session).lean();
    return { revision: row.revision, items: rows.slice(0, 50), nextAfter: rows.length > 50 ? rows[49].position : null };
  };
}
