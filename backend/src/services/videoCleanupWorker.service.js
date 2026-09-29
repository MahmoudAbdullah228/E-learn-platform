import { randomUUID } from 'node:crypto';

import { logger, serializeError } from '../config/logger.js';
import { VideoCleanupJob } from '../models/VideoCleanupJob.js';

const LEASE_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;

function retryDelay(attempts) {
  return Math.min(2 ** Math.max(attempts - 1, 0) * 5000, MAX_RETRY_DELAY_MS);
}

export function createVideoCleanupWorker({
  videoProvider,
  clock = () => new Date(),
  shutdownTimeoutMs = 10_000,
} = {}) {
  let timer;
  let running;
  let stopped = false;
  const controller = new AbortController();

  async function processOne() {
    if (stopped) return false;
    const now = clock();
    const leaseId = randomUUID();
    const job = await VideoCleanupJob.findOneAndUpdate(
      {
        availableAt: { $lte: now },
        $or: [
          { exhaustedAt: null, attempts: { $lt: MAX_ATTEMPTS } },
          // A legacy job at the old attempt limit may represent interrupted work.
          { exhaustedAt: { $exists: false } },
        ],
      },
      { $set: { leaseId, availableAt: new Date(now.getTime() + LEASE_MS) } },
      { returnDocument: 'after', sort: { availableAt: 1 } },
    ).select('+leaseId');
    if (!job) return false;

    async function releaseLease() {
      try {
        await VideoCleanupJob.updateOne({ _id: job._id, leaseId }, {
          $set: { leaseId: null, availableAt: clock() },
        });
      } catch (error) {
        logger.error(serializeError(error), 'Video cleanup lease release failed');
      }
    }

    if (stopped) {
      await releaseLease();
      return false;
    }

    try {
      await videoProvider.cleanupResource({
        resourceType: job.resourceType,
        resourceId: job.resourceId,
        signal: controller.signal,
      });
      if (stopped) {
        await releaseLease();
        return false;
      }
      await VideoCleanupJob.deleteOne({ _id: job._id, leaseId });
    } catch (error) {
      if (stopped || controller.signal.aborted) {
        await releaseLease();
        return false;
      }

      const failedAt = clock();
      const nextAttempts = job.attempts + 1;
      const exhausted = nextAttempts >= MAX_ATTEMPTS;
      logger.error(serializeError(error), 'Video provider cleanup failed');
      await VideoCleanupJob.updateOne({ _id: job._id, leaseId }, {
        $inc: { attempts: 1 },
        $set: {
          availableAt: exhausted
            ? failedAt
            : new Date(failedAt.getTime() + retryDelay(nextAttempts)),
          leaseId: null,
          lastErrorAt: failedAt,
          exhaustedAt: exhausted ? failedAt : null,
        },
      });
    }
    return true;
  }

  function processNext() {
    if (stopped || running) return Promise.resolve(false);
    running = processOne().finally(() => { running = undefined; });
    return running;
  }

  function tick() {
    void processNext().catch(error => logger.error(serializeError(error),
      'Video cleanup worker failed'));
  }

  return Object.freeze({
    processNext,
    start() {
      if (timer || stopped) return;
      timer = setInterval(tick, 5000);
      timer.unref();
      tick();
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
      } finally {
        clearTimeout(deadline);
      }
    },
  });
}
