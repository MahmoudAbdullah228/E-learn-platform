import { MediaAsset } from '../models/MediaAsset.js';
import { MediaCleanupJob } from '../models/MediaCleanupJob.js';

export async function enqueueAttachmentCleanup(lessons, session, now = new Date()) {
  const assetIds = [...new Set(lessons.flatMap(lesson =>
    (lesson.attachments ?? []).map(id => id.toString())))];
  if (assetIds.length === 0) return;
  await MediaAsset.updateMany({ _id: { $in: assetIds }, status: 'ready' },
    { $set: { status: 'deleting' } }, { session });
  await MediaCleanupJob.bulkWrite(assetIds.map(assetId => ({
    updateOne: {
      filter: { assetId },
      update: { $setOnInsert: { assetId, availableAt: now } },
      upsert: true,
    },
  })), { session, ordered: false });
}
