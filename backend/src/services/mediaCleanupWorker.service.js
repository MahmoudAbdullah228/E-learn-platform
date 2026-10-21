import { randomUUID } from 'node:crypto';

import mongoose from 'mongoose';

import { logger, serializeError } from '../config/logger.js';
import { Course } from '../models/Course.js';
import { Lesson } from '../models/Lesson.js';
import { MediaAsset } from '../models/MediaAsset.js';
import { MediaCleanupJob } from '../models/MediaCleanupJob.js';
import { User } from '../models/User.js';
import { enqueueMediaCleanup } from './mediaCleanupQueue.service.js';
import { pendingUploadCleanupAt } from './mediaCleanup.policy.js';

const leaseMs = 10 * 60 * 1000;
const maxAttempts = 10;
const maxWorkPerTick = 25;

async function stillReferenced(asset) {
  if (asset.purpose === 'avatar') {
    return Boolean(await User.exists({ avatarAssetId: asset._id }));
  }
  if (asset.purpose === 'course_cover') {
    return Boolean(await Course.exists({ coverAssetId: asset._id }));
  }
  return Boolean(await Lesson.exists({ attachments: asset._id }));
}

export function createMediaCleanupWorker({ provider, clock = () => new Date(),
  shutdownTimeoutMs = 10_000 } = {}) {
  let timer;
  let running;
  let stopped = false;
  const controller = new AbortController();

  async function processOne() {
    if (stopped) return false;
    const now = clock();
    // Intents can expire without explicit deletion; give provider uploads time to settle.
    const expired = await MediaAsset.findOne({ status: 'pending', expiresAt: { $lte: now } })
      .sort({ expiresAt: 1 });
    if (stopped) return false;
    let expiredQueued = false;
    if (expired) {
      await mongoose.connection.transaction(async session => {
        controller.signal.throwIfAborted();
        await enqueueMediaCleanup(expired, session, now);
        controller.signal.throwIfAborted();
        expiredQueued = true;
      });
    }

    if (stopped) return false;
    const leaseId = randomUUID();
    const job = await MediaCleanupJob.findOneAndUpdate({
      availableAt: { $lte: now }, exhaustedAt: null, attempts: { $lt: maxAttempts },
    }, { $set: { leaseId, availableAt: new Date(now.getTime() + leaseMs) } },
    { returnDocument: 'after', sort: { availableAt: 1 } }).select('+leaseId');
    if (!job) return expiredQueued;

    async function release(availableAt = new Date(clock().getTime() + 5000)) {
      if (stopped) return;
      await MediaCleanupJob.updateOne({ _id: job._id, leaseId },
        { $set: { leaseId: null, availableAt } });
    }
    if (stopped) return false;
    try {
      const asset = await MediaAsset.findById(job.assetId).select('+cleanupNotBefore');
      if (stopped) return false;
      if (!asset || asset.status === 'deleted') {
        await MediaCleanupJob.deleteOne({ _id: job._id, leaseId });
        return true;
      }
      if (asset.status === 'pending') {
        // Repair old prematurely queued jobs without polling them on every tick.
        await release(new Date(Math.max(now.getTime() + 5000, asset.expiresAt.getTime())));
        return true;
      }
      const cleanupNotBefore = asset.cleanupNotBefore
        ?? (asset.status === 'deleting' && !asset.providerAssetId && !asset.attachedAt
          ? pendingUploadCleanupAt(asset) : null);
      if (cleanupNotBefore && cleanupNotBefore > now) {
        // A previously due/claimed job cannot override a pending upload's deadline.
        await release(cleanupNotBefore);
        return true;
      }
      if (asset.status !== 'deleting' || await stillReferenced(asset)) {
        // A reference can be replaced concurrently; retry rather than delete in that case.
        await release();
        return false;
      }
      if (stopped) return false;
      await provider.deleteUpload({ publicId: asset.publicId, resourceType: asset.resourceType,
        deliveryType: asset.deliveryType, signal: controller.signal });
      // Leave cancelled jobs leased: another worker recovers them after lease expiry.
      if (stopped) return false;
      await MediaAsset.updateOne({ _id: asset._id, status: 'deleting' },
        { $set: { status: 'deleted' } });
      if (stopped) return false;
      await MediaCleanupJob.deleteOne({ _id: job._id, leaseId });
    } catch (error) {
      if (stopped) return false;
      logger.error(serializeError(error), 'Media cleanup failed');
      const attempts = job.attempts + 1;
      const failedAt = clock();
      await MediaCleanupJob.updateOne({ _id: job._id, leaseId }, {
        $inc: { attempts: 1 },
        $set: {
          leaseId: null, lastErrorAt: failedAt,
          exhaustedAt: attempts >= maxAttempts ? failedAt : null,
          availableAt: new Date(failedAt.getTime() + Math.min(2 ** attempts * 5000, 3600000)),
        },
      });
    }
    return true;
  }

  function processNext() {
    if (stopped || running) return Promise.resolve(false);
    running = (async () => {
      let processed = false;
      for (let count = 0; count < maxWorkPerTick && !stopped; count += 1) {
        if (!await processOne()) break;
        processed = true;
      }
      return processed;
    })().catch(error => {
      if (stopped) return false;
      throw error;
    }).finally(() => { running = undefined; });
    return running;
  }

  return Object.freeze({
    processNext,
    start() {
      if (stopped || timer) return;
      timer = setInterval(() => {
        void processNext().catch(error => logger.error(serializeError(error),
          'Media cleanup worker failed'));
      }, 5000);
      timer.unref();
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      timer = undefined;
      controller.abort();
      let deadline;
      try {
        await Promise.race([running, new Promise(resolve => {
          deadline = setTimeout(resolve, shutdownTimeoutMs);
        })]);
      } finally { clearTimeout(deadline); }
    },
  });
}
