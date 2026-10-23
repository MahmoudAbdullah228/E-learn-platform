import { randomUUID } from 'node:crypto';

import { Lesson } from '../models/Lesson.js';
import { VideoPlaybackLease } from '../models/VideoPlaybackLease.js';
import { ApiError } from '../utils/ApiError.js';

export const playbackUnavailable = () => new ApiError(503, 'VIDEO_PROVIDER_UNAVAILABLE',
  'Video playback is temporarily unavailable');

// Lease lifetime exceeds the bounded provider operation. A stale process cannot release a new lease.
export async function prepareSignedPlayback({ lessonId, assetId, provider, signal,
  clock = () => new Date() }) {
  signal.throwIfAborted();
  const owner = randomUUID();
  const now = clock();
  let lease;
  try {
    lease = await VideoPlaybackLease.findOneAndUpdate({ _id: assetId,
      expiresAt: { $lte: now } }, { $set: { owner, expiresAt: new Date(now.getTime() + 120_000) } },
    { upsert: true, returnDocument: 'after' });
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }
  if (!lease) throw new ApiError(503, 'PLAYBACK_PREPARING', 'Video playback is being prepared. Please retry');
  try {
    signal.throwIfAborted();
    if (!await Lesson.exists({ _id: lessonId, videoAssetId: assetId, videoStatus: 'ready' })) {
      throw new ApiError(409, 'VIDEO_STATE_CHANGED', 'The lesson video changed. Please retry');
    }
    const playbackId = await provider.ensureSignedPlaybackId({ assetId, lessonId, signal });
    signal.throwIfAborted();
    if (!await VideoPlaybackLease.exists({ _id: assetId, owner, expiresAt: { $gt: clock() } })) {
      throw playbackUnavailable();
    }
    return playbackId;
  } finally {
    // After cancellation the remote operation may still be uncertain. Keep its bounded
    // lease until expiry; late results must neither write DB nor unlock a newer process.
    if (!signal.aborted) await VideoPlaybackLease.deleteOne({ _id: assetId, owner });
  }
}
