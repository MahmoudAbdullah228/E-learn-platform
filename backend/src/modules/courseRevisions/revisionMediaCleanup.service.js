import { RevisionLesson } from '../../models/CourseRevision.js';
import { enqueueVideoCleanup } from '../../services/videoCleanupQueue.service.js';
import { MediaAsset } from '../../models/MediaAsset.js';
import { enqueueMediaCleanup } from '../../services/mediaCleanupQueue.service.js';

export async function cleanupCandidateMedia(revisionId, session, targets = {}) {
  const assets = MediaAsset.find({ revisionId, ...targets, status: { $in: ['pending', 'ready'] } })
    .select('+cleanupNotBefore').session(session).cursor();
  for await (const asset of assets) await releaseCandidateAsset(asset, session);
}

export async function cleanupCandidateVideos(revisionId, session, filter = {}) {
  const rows = RevisionLesson.find({ revisionId, ...filter, videoUploadAttemptId: { $type: 'string' } })
    .select('+videoAssetId +videoUploadId').session(session).cursor();
  for await (const row of rows) {
    await enqueueVideoCleanup([row], session, new Date(Date.now() + 901_000));
    await RevisionLesson.updateOne({ _id: row._id }, { $set: { videoUploadAttemptId: null,
      videoUploadExpiresAt: null, videoUploadId: null, videoAssetId: null, videoStatus: 'none' } }, { session });
  }
}

// Previously issued authenticated download URLs can remain valid for 60 seconds.
export async function releaseCandidateAsset(asset, session) {
  if (asset.status === 'ready') asset.cleanupNotBefore = new Date(Date.now() + 61_000);
  await enqueueMediaCleanup(asset, session);
}
