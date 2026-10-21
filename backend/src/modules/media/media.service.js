import { randomUUID } from 'node:crypto';

import mongoose from 'mongoose';

import { env } from '../../config/env.js';
import { Course } from '../../models/Course.js';
import { Lesson } from '../../models/Lesson.js';
import { MediaAsset } from '../../models/MediaAsset.js';
import { MediaCleanupJob } from '../../models/MediaCleanupJob.js';
import { Section } from '../../models/Section.js';
import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { cloudinaryPublicId } from '../../utils/cloudinaryPublicId.js';

const transactionOptions = { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } };
const uploadSettlementMs = 5 * 60 * 1000;
const purposeSettings = Object.freeze({
  avatar: { resourceType: 'image', deliveryType: 'upload', maxBytes: () => env.CLOUDINARY_MAX_IMAGE_BYTES },
  course_cover: { resourceType: 'image', deliveryType: 'upload', maxBytes: () => env.CLOUDINARY_MAX_IMAGE_BYTES },
  lesson_attachment: { resourceType: 'raw', deliveryType: 'authenticated', maxBytes: () => env.CLOUDINARY_MAX_ATTACHMENT_BYTES },
});

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

async function enqueueCleanup(asset, session, availableAt) {
  await MediaCleanupJob.updateOne({ assetId: asset._id }, {
    $setOnInsert: { assetId: asset._id, availableAt },
  }, { upsert: true, session });
}

export function createMediaService({ provider, clock = () => new Date() }) {
  const transaction = work => mongoose.connection.transaction(work, transactionOptions);

  return Object.freeze({
    async createIntent({ ownerId, input }) {
      const settings = purposeSettings[input.purpose];
      await editableTarget({ ...input, ownerId });
      const publicId = cloudinaryPublicId(
        `elearn/${input.purpose}/${ownerId}/${randomUUID()}`, settings.resourceType,
      );
      const upload = provider.createSignedUpload({ publicId, purpose: input.purpose });
      if (!(upload.expiresAt instanceof Date)
          || !Number.isFinite(upload.expiresAt.getTime())
          || upload.expiresAt <= clock()
          || !(upload.providerUploadValidUntil instanceof Date)
          || !Number.isFinite(upload.providerUploadValidUntil.getTime())
          || upload.providerUploadValidUntil < upload.expiresAt) {
        throw new ApiError(503, 'MEDIA_PROVIDER_UNAVAILABLE',
          'Media uploads are temporarily unavailable');
      }
      const asset = await MediaAsset.create({
        ownerId, purpose: input.purpose, targetId: input.targetId, publicId,
        resourceType: settings.resourceType, deliveryType: settings.deliveryType,
        expiresAt: upload.expiresAt,
        providerUploadValidUntil: upload.providerUploadValidUntil,
      });
      return { assetId: asset.id, upload, maxBytes: settings.maxBytes() };
    },

    async confirm({ ownerId, assetId }) {
      const asset = await MediaAsset.findOne({ _id: assetId, ownerId, status: 'pending' });
      if (!asset) throw assetNotFound();
      if (asset.expiresAt <= clock()) throw conflict();
      await editableTarget({ purpose: asset.purpose, targetId: asset.targetId, ownerId });
      const uploaded = await provider.inspectUpload(asset);
      if (!uploaded) throw new ApiError(409, 'MEDIA_UPLOAD_NOT_FOUND', 'Upload is not available yet');
      const allowedFormats = asset.purpose === 'lesson_attachment' ? ['pdf'] : ['jpg', 'jpeg', 'png', 'webp'];
      // Cloudinary raw metadata omits format. Only infer PDF from the exact,
      // server-owned raw ID, never from a client filename or arbitrary provider ID.
      const expectedPublicId = cloudinaryPublicId(asset.publicId, asset.resourceType);
      const format = asset.resourceType === 'raw' && uploaded.format === undefined
        ? 'pdf' : typeof uploaded.format === 'string' ? uploaded.format.toLowerCase() : null;
      if (uploaded.public_id !== expectedPublicId || uploaded.type !== asset.deliveryType
          || uploaded.resource_type !== asset.resourceType
          || !allowedFormats.includes(format)
          || !Number.isSafeInteger(uploaded.bytes) || uploaded.bytes < 1
          || uploaded.bytes > purposeSettings[asset.purpose].maxBytes()
          || typeof uploaded.asset_id !== 'string' || uploaded.asset_id.length === 0) {
        throw new ApiError(409, 'MEDIA_UPLOAD_INVALID', 'Uploaded file does not match its intent');
      }
      return transaction(async session => {
        const claimed = await MediaAsset.findOneAndUpdate({
          _id: assetId, ownerId, status: 'pending', expiresAt: { $gt: clock() },
        }, { $set: {
          status: 'ready', providerAssetId: uploaded.asset_id,
          bytes: uploaded.bytes, format, attachedAt: clock(),
          originalName: typeof uploaded.original_filename === 'string'
            ? uploaded.original_filename.replace(/[\p{Cc}\p{Cf}\\/]/gu, '').slice(0, 255) : null,
        } }, { session, returnDocument: 'after', runValidators: true });
        if (!claimed) throw conflict();
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
            const old = await MediaAsset.findOneAndUpdate({ _id: previous, status: 'ready' },
              { $set: { status: 'deleting' } }, { session });
            if (old) await enqueueCleanup(old, session, clock());
          }
        }
        return toAsset(claimed);
      });
    },

    async remove({ ownerId, assetId }) {
      await transaction(async session => {
        const asset = await MediaAsset.findOne({ _id: assetId, ownerId,
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
        const wasPending = asset.status === 'pending';
        asset.status = 'deleting';
        await asset.save({ session });
        await enqueueCleanup(asset, session, wasPending
          ? new Date(Math.max(asset.expiresAt.getTime(),
            asset.providerUploadValidUntil?.getTime() ?? 0, clock().getTime())
            + uploadSettlementMs)
          : clock());
      });
    },
  });
}
