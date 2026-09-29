import { randomUUID } from 'node:crypto';

import mongoose from 'mongoose';

import { env } from '../../config/env.js';
import { Course } from '../../models/Course.js';
import { Lesson } from '../../models/Lesson.js';
import { Section } from '../../models/Section.js';
import { VideoAssetState } from '../../models/VideoAssetState.js';
import { enqueueVideoCleanup } from '../../services/videoCleanupQueue.service.js';
import { ApiError } from '../../utils/ApiError.js';

const attemptIdPattern = /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;

function validAttemptId(value) {
  return typeof value === 'string' && attemptIdPattern.test(value);
}

function notFound() {
  return new ApiError(404, 'CURRICULUM_NOT_FOUND', 'Draft course content was not found');
}

async function lockOwnedLesson({ lessonId, instructorId, session }) {
  const lesson = await Lesson.findById(lessonId)
    .select('+videoUploadAttemptId +videoUploadId +videoAssetId +videoUploadExpiresAt')
    .session(session);
  if (!lesson) throw notFound();
  const section = await Section.findById(lesson.sectionId).session(session).lean();
  if (!section) throw notFound();
  const course = await Course.findOneAndUpdate(
    { _id: section.courseId, instructorId, status: 'draft' },
    { $inc: { curriculumRevision: 1 } },
    { session },
  );
  if (!course) throw notFound();
  return lesson;
}

function uploadConflict(status) {
  if (['pending', 'processing'].includes(status)) {
    return new ApiError(409, 'VIDEO_UPLOAD_IN_PROGRESS',
      'This lesson already has a video upload in progress');
  }
  return new ApiError(409, 'VIDEO_ALREADY_EXISTS',
    'This lesson already has a ready video');
}

function webhookTransition(event) {
  if (event.type === 'video.asset.deleted') {
    if (typeof event.data?.id !== 'string') return null;
    const attemptId = validAttemptId(event.data.passthrough) ? event.data.passthrough : null;
    return {
      assetId: event.data.id,
      assetDeleted: true,
      match: attemptId ? {
        $or: [{ videoAssetId: event.data.id }, { videoUploadAttemptId: attemptId }],
      } : { videoAssetId: event.data.id },
      from: ['pending', 'processing', 'ready', 'failed'],
      set: {
        videoStatus: 'failed', durationSeconds: 0,
        videoUploadId: null, videoAssetId: null, videoUploadExpiresAt: null,
      },
    };
  }
  const uploadEvents = new Set([
    'video.upload.asset_created', 'video.upload.errored', 'video.upload.cancelled',
  ]);
  const attemptId = uploadEvents.has(event.type)
    ? event.data?.new_asset_settings?.passthrough
    : event.data?.passthrough;
  if (!validAttemptId(attemptId)) return null;

  if (event.type === 'video.upload.asset_created') {
    if (typeof event.data.asset_id !== 'string') return null;
    return {
      attemptId, assetId: event.data.asset_id, assetDeleted: false,
      from: ['pending', 'processing'],
      set: {
        videoStatus: 'processing', videoAssetId: event.data.asset_id,
        videoUploadExpiresAt: null,
      },
    };
  }
  if (event.type === 'video.asset.created') {
    if (typeof event.data.id !== 'string') return null;
    return {
      attemptId, assetId: event.data.id, assetDeleted: false,
      from: ['pending', 'processing'],
      set: {
        videoStatus: 'processing', videoAssetId: event.data.id,
        videoUploadExpiresAt: null,
      },
    };
  }
  if (event.type === 'video.asset.ready') {
    if (typeof event.data.id !== 'string') return null;
    const durationSeconds = Number.isFinite(event.data.duration) && event.data.duration >= 0
      ? Math.ceil(event.data.duration) : 0;
    return {
      attemptId, assetId: event.data.id, assetDeleted: false,
      from: ['pending', 'processing', 'ready'],
      set: {
        videoStatus: 'ready', videoAssetId: event.data.id,
        durationSeconds,
        videoUploadExpiresAt: null,
      },
    };
  }
  if (['video.asset.errored', 'video.upload.errored', 'video.upload.cancelled']
    .includes(event.type)) {
    return {
      attemptId, from: ['pending', 'processing', 'failed'],
      set: {
        videoStatus: 'failed', durationSeconds: 0, videoUploadExpiresAt: null,
      },
    };
  }
  return null;
}

export function createVideoService({
  videoProvider,
  attemptIdFactory = randomUUID,
  clock = () => new Date(),
  reservationGraceSeconds = 300,
} = {}) {
  return Object.freeze({
    async createUpload({ lessonId, instructorId }) {
      const attemptId = attemptIdFactory();
      const supersededUploadId = await mongoose.connection.transaction(async session => {
        const lesson = await lockOwnedLesson({ lessonId, instructorId, session });
        const pendingExpired = lesson.videoStatus === 'pending'
          && lesson.videoUploadExpiresAt instanceof Date
          && lesson.videoUploadExpiresAt <= clock();
        if (!['none', 'failed'].includes(lesson.videoStatus) && !pendingExpired) {
          throw uploadConflict(lesson.videoStatus);
        }
        const replacingUpload = lesson.videoStatus === 'failed' || pendingExpired;
        const supersededUploadId = replacingUpload && !lesson.videoAssetId
          ? lesson.videoUploadId : null;
        if (replacingUpload) await enqueueVideoCleanup([lesson], session);
        lesson.videoStatus = 'pending';
        lesson.videoUploadAttemptId = attemptId;
        lesson.videoUploadId = null;
        lesson.videoAssetId = null;
        lesson.durationSeconds = 0;
        lesson.videoUploadExpiresAt = new Date(clock().getTime()
          + (env.MUX_UPLOAD_TIMEOUT_SECONDS + reservationGraceSeconds) * 1000);
        await lesson.save({ session });
        return supersededUploadId;
      });
      await videoProvider.cancelDirectUpload(supersededUploadId);

      let upload;
      try {
        upload = await videoProvider.createDirectUpload({ lessonId, attemptId });
      } catch (error) {
        try {
          await Lesson.updateOne(
            { _id: lessonId, videoUploadAttemptId: attemptId, videoStatus: 'pending' },
            { $set: { videoStatus: 'failed', videoUploadExpiresAt: null } },
          );
        } catch {
          // Preserve the provider's safe error; an expired reservation is retryable later.
        }
        throw error;
      }

      let result;
      try {
        result = await Lesson.updateOne(
          { _id: lessonId, videoUploadAttemptId: attemptId, videoStatus: 'pending' },
          { $set: { videoUploadId: upload.id } },
          { runValidators: true },
        );
      } catch (error) {
        try {
          await videoProvider.cancelDirectUpload(upload.id);
        } catch {
          // Preserve the database error; the provider URL was never returned to the client.
        }
        try {
          await Lesson.updateOne(
            { _id: lessonId, videoUploadAttemptId: attemptId, videoStatus: 'pending' },
            { $set: {
              videoStatus: 'failed', videoUploadId: null, videoUploadExpiresAt: null,
            } },
          );
        } catch {
          // The expiry remains a final recovery path during a continuing database outage.
        }
        throw error;
      }
      if (result.modifiedCount !== 1) {
        await videoProvider.cancelDirectUpload(upload.id);
        throw new ApiError(409, 'VIDEO_UPLOAD_STATE_CONFLICT',
          'The lesson changed while its upload was being prepared');
      }
      return {
        upload: {
          id: upload.id,
          url: upload.url,
          timeoutSeconds: upload.timeoutSeconds,
          videoStatus: 'pending',
        },
      };
    },

    async handleWebhook({ rawBody, headers }) {
      const event = await videoProvider.unwrapWebhook({ rawBody, headers });
      const transition = webhookTransition(event);
      if (!transition) return { received: true, handled: false };
      const handled = await mongoose.connection.transaction(async session => {
        if (transition.assetId) {
          if (transition.assetDeleted) {
            await VideoAssetState.updateOne(
              { _id: transition.assetId },
              { $set: { deletedAt: clock() } },
              { upsert: true, session },
            );
          } else {
            await VideoAssetState.updateOne(
              { _id: transition.assetId },
              { $setOnInsert: { deletedAt: null } },
              { upsert: true, session },
            );
            const assetState = await VideoAssetState.findById(transition.assetId)
              .session(session).lean();
            if (assetState.deletedAt) {
              const deletedResult = await Lesson.updateOne(
                {
                  videoUploadAttemptId: transition.attemptId,
                  videoStatus: { $in: transition.from },
                },
                { $set: {
                  videoStatus: 'failed', durationSeconds: 0,
                  videoUploadId: null, videoAssetId: null, videoUploadExpiresAt: null,
                } },
                { runValidators: true, session },
              );
              return deletedResult.matchedCount === 1;
            }
          }
        }
        const result = await Lesson.updateOne(
          {
            ...(transition.match ?? { videoUploadAttemptId: transition.attemptId }),
            videoStatus: { $in: transition.from },
          },
          { $set: transition.set },
          { runValidators: true, session },
        );
        return result.matchedCount === 1;
      });
      return { received: true, handled };
    },
  });
}
