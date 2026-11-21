import mongoose from 'mongoose';

import { Course } from '../../models/Course.js';
import { Lesson } from '../../models/Lesson.js';
import { MediaAsset } from '../../models/MediaAsset.js';
import { Section } from '../../models/Section.js';
import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { claimMediaIntent, inspectMediaIntent, issueMediaIntent } from './mediaIntent.service.js';
import { enqueueMediaCleanup } from '../../services/mediaCleanupQueue.service.js';

const transactionOptions = { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } };
function notFound() {
  return new ApiError(404, 'MEDIA_TARGET_NOT_FOUND', 'Editable media target was not found');
}

function conflict() {
  return new ApiError(409, 'MEDIA_STATE_CONFLICT', 'Media is no longer available for this action');
}

function assetNotFound() {
  return new ApiError(404, 'MEDIA_NOT_FOUND', 'Media asset was not found');
}

async function editableTarget({ purpose, targetId, ownerId, session, lock = false }) {
  if (purpose === 'avatar') {
    if (targetId.toString() !== ownerId.toString()) throw notFound();
    const filter = { _id: targetId, status: 'active' };
    const user = lock
      ? await User.findOneAndUpdate(filter, { $inc: { mediaRevision: 1 } }, { session })
      : await User.findOne(filter).session(session);
    if (!user) throw notFound();
    return { reference: user.avatarAssetId, field: 'avatarAssetId' };
  }
  const instructor = await User.exists({ _id: ownerId, status: 'active',
    instructorStatus: 'approved', roles: 'instructor' }).session(session);
  if (!instructor) throw notFound();
  let courseId = targetId;
  if (purpose === 'lesson_attachment') {
    const lesson = await Lesson.findById(targetId).session(session);
    if (!lesson) throw notFound();
    const section = await Section.findById(lesson.sectionId).session(session);
    if (!section) throw notFound();
    courseId = section.courseId;
  }
  const filter = { _id: courseId, instructorId: ownerId, status: 'draft' };
  const course = lock
    ? await Course.findOneAndUpdate(filter, { $inc: { curriculumRevision: 1 } }, { session })
    : await Course.findOne(filter).session(session);
  if (!course) {
    const owned = await Course.findOne({ _id: courseId, instructorId: ownerId })
      .select('status').session(session).lean();
    if (owned && owned.status !== 'draft') {
      throw new ApiError(409, 'INVALID_COURSE_STATE',
        'Media can be changed only while the course is a draft');
    }
    throw notFound();
  }
  return { reference: course.coverAssetId, field: purpose === 'course_cover' ? 'coverAssetId' : 'attachments' };
}

function toAsset(asset) {
  return {
    id: asset._id.toString(), purpose: asset.purpose, targetId: asset.targetId.toString(),
    status: asset.status, bytes: asset.bytes, format: asset.format,
    originalName: asset.originalName, attachedAt: asset.attachedAt,
  };
}

export function createMediaService({ provider, clock = () => new Date() }) {
  const transaction = work => mongoose.connection.transaction(work, transactionOptions);

  return Object.freeze({
    async createIntent({ ownerId, input }) {
      await editableTarget({ ...input, ownerId });
      return issueMediaIntent({ ownerId, input, provider, clock });
    },

    async confirm({ ownerId, assetId }) {
      const asset = await MediaAsset.findOne({ _id: assetId, revisionId: null, ownerId, status: 'pending' });
      if (!asset) throw assetNotFound();
      if (asset.expiresAt <= clock()) throw conflict();
      await editableTarget({ purpose: asset.purpose, targetId: asset.targetId, ownerId });
      const inspected = await inspectMediaIntent(asset, provider);
      return transaction(async session => {
        const claimed = await claimMediaIntent(asset, inspected, session, clock);
        const owned = await editableTarget({ purpose: asset.purpose, targetId: asset.targetId,
          ownerId, session, lock: true });
        if (asset.purpose === 'lesson_attachment') {
          const result = await Lesson.updateOne({ _id: asset.targetId, attachments: { $size: 0 } },
            { $set: { attachments: [claimed._id] } }, { session });
          if (!result.modifiedCount) throw new ApiError(409, 'ATTACHMENT_LIMIT_REACHED',
            'A lesson can have one attachment');
        } else {
          const previous = owned.reference;
          const Model = asset.purpose === 'avatar' ? User : Course;
          await Model.updateOne({ _id: asset.targetId },
            { $set: { [owned.field]: claimed._id } }, { session });
          if (previous && previous.toString() !== claimed.id) {
            const old = await MediaAsset.findOne({ _id: previous, status: 'ready' }).session(session);
            if (old) await enqueueMediaCleanup(old, session, clock());
          }
        }
        return toAsset(claimed);
      });
    },

    async remove({ ownerId, assetId }) {
      await transaction(async session => {
        const asset = await MediaAsset.findOne({ _id: assetId, revisionId: null, ownerId,
          status: { $in: ['pending', 'ready'] } }).session(session);
        if (!asset) throw assetNotFound();
        const owned = await editableTarget({ purpose: asset.purpose, targetId: asset.targetId,
          ownerId, session, lock: true });
        if (asset.purpose === 'lesson_attachment') {
          await Lesson.updateOne({ _id: asset.targetId, attachments: asset._id },
            { $pull: { attachments: asset._id } }, { session });
        } else if (owned.reference?.toString() === asset.id) {
          const Model = asset.purpose === 'avatar' ? User : Course;
          await Model.updateOne({ _id: asset.targetId, [owned.field]: asset._id },
            { $set: { [owned.field]: null } }, { session });
        }
        await enqueueMediaCleanup(asset, session, clock());
      });
    },
  });
}
