import { MediaAsset } from '../models/MediaAsset.js';
import { MediaCleanupJob } from '../models/MediaCleanupJob.js';
import { pendingUploadCleanupAt } from './mediaCleanup.policy.js';

// Called in the same transaction as detachment/target deletion.
export async function enqueueMediaCleanup(asset, session, now = new Date()) {
  if (!['pending', 'ready', 'deleting'].includes(asset.status)) return;
  const cleanupNotBefore = asset.status === 'pending'
    ? pendingUploadCleanupAt(asset, now) : asset.cleanupNotBefore;
  const changed = await MediaAsset.updateOne({ _id: asset._id, status: asset.status }, {
    $set: { status: 'deleting', ...(cleanupNotBefore ? { cleanupNotBefore } : {}) },
  }, { session });
  if (!changed.matchedCount) return;
  await MediaCleanupJob.updateOne({ assetId: asset._id }, {
    $setOnInsert: { assetId: asset._id },
    // Existing jobs must not bypass the deadline or have their retry/lease shortened.
    $max: { availableAt: cleanupNotBefore ?? now },
  }, { upsert: true, session });
}

export async function enqueueAttachmentCleanup(lessons, session, now = new Date()) {
  const assetIds = [...new Set(lessons.flatMap(lesson =>
    (lesson.attachments ?? []).map(id => id.toString())))];
  const lessonIds = lessons.map(lesson => lesson._id);
  if (!assetIds.length && !lessonIds.length) return;
  // Pending intents are not in Lesson.attachments until confirmation succeeds.
  const assets = await MediaAsset.find({
    purpose: 'lesson_attachment',
    status: { $in: ['pending', 'ready', 'deleting'] },
    $or: [{ _id: { $in: assetIds } }, { targetId: { $in: lessonIds }, status: 'pending' }],
  }).select('+cleanupNotBefore').session(session);
  // A transaction session must not run parallel database operations.
  for (const asset of assets) await enqueueMediaCleanup(asset, session, now);
}
