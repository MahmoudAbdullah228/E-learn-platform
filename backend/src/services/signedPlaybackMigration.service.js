import { Lesson } from '../models/Lesson.js';
import { prepareSignedPlayback } from './videoPlayback.service.js';

// Provider state is the idempotency source, not a local "migrated" flag.
export async function migrateSignedPlayback({ provider, videoService, apply = false,
  after, limit = 50 }) {
  const lessons = await Lesson.find({ videoStatus: 'ready', videoAssetId: { $type: 'string' },
    ...(after ? { _id: { $gt: after } } : {}) })
    .select('_id +videoAssetId').sort({ _id: 1 }).limit(limit).lean();
  const result = { apply, candidates: lessons.length, secured: 0, unavailable: 0, failed: 0,
    nextAfter: lessons.at(-1)?._id.toString() ?? null };
  if (!apply) return result;
  for (const lesson of lessons) {
    const signal = AbortSignal.timeout(30_000);
    try {
      await prepareSignedPlayback({ lessonId: lesson._id.toString(), assetId: lesson.videoAssetId,
        provider, signal });
      result.secured += 1;
    } catch (error) {
      if (!signal.aborted && error?.code === 'VIDEO_ASSET_UNAVAILABLE') {
        await videoService.markAssetUnavailable(lesson.videoAssetId);
        result.unavailable += 1;
      } else {
        result.failed += 1;
      }
    }
  }
  return result;
}
