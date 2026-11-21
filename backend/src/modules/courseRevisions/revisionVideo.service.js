import { randomUUID } from 'node:crypto';

import { env } from '../../config/env.js';
import { CourseRevision, RevisionLesson } from '../../models/CourseRevision.js';
import { enqueueVideoCleanup } from '../../services/videoCleanupQueue.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { accessCandidate } from './courseRevisions.service.js';

const stateConflict = () => new ApiError(409, 'VIDEO_UPLOAD_STATE_CONFLICT', 'Reload the current lesson video state');

export async function createCandidateVideo(context, provider) {
  const attempt = randomUUID();
  const filter = { revisionId: context.revisionId, logicalId: context.lessonId };
  const result = await accessCandidate(context, async (row, session) => {
    const lesson = await RevisionLesson.findOne(filter).select('+videoAssetId +videoUploadId +videoUploadExpiresAt +videoUploadAttemptId')
      .session(session);
    if (!lesson) throw new ApiError(404, 'REVISION_NOT_FOUND', 'Course revision lesson was not found');
    if (lesson.videoStatus === 'processing' || (lesson.videoStatus === 'pending' && lesson.videoUploadExpiresAt > new Date())) {
      throw stateConflict();
    }
    // Snapshot rows inherit the live asset but never inherit its upload attempt.
    if (lesson.videoUploadAttemptId) await enqueueVideoCleanup([lesson], session, new Date(Date.now() + 901_000));
    lesson.set({ videoAssetId: null, videoUploadId: null, videoUploadAttemptId: attempt,
      videoUploadExpiresAt: new Date(Date.now() + 1000 * (env.MUX_UPLOAD_TIMEOUT_SECONDS + 300)),
      videoStatus: 'pending', durationSeconds: 0 });
    await lesson.save({ session });
  });
  let upload;
  try {
    upload = await provider.createDirectUpload({ lessonId: context.lessonId, attemptId: attempt });
    const saved = await RevisionLesson.updateOne({ ...filter, videoUploadAttemptId: attempt,
      videoStatus: { $in: ['pending', 'processing', 'ready'] } }, { $set: { videoUploadId: upload.id } });
    if (!saved.matchedCount) throw stateConflict();
    return { ...result, upload: { id: upload.id, url: upload.url, timeoutSeconds: upload.timeoutSeconds } };
  } catch (error) {
    if (upload) await provider.cancelDirectUpload(upload.id);
    await RevisionLesson.updateOne({ ...filter, videoUploadAttemptId: attempt, videoStatus: 'pending' },
      { $set: { videoStatus: 'failed', videoUploadExpiresAt: null } });
    throw error;
  }
}

export async function updateCandidateVideos(match, from, fields, session) {
  const rows = RevisionLesson.find({ ...match, videoStatus: { $in: from } })
    .select('+videoAssetId +videoUploadId +videoUploadExpiresAt').session(session).cursor();
  let handled = false;
  for await (const row of rows) {
    const candidate = await CourseRevision.findOne({ _id: row.revisionId, active: true }).session(session);
    if (!candidate) continue;
    handled = true;
    row.set(fields);
    if (row.isModified()) {
      await row.save({ session });
      await CourseRevision.updateOne({ _id: candidate._id }, { $inc: { revision: 1 } }, { session });
    }
  }
  return handled;
}
