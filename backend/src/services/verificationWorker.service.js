import { randomUUID } from 'node:crypto';

import { logger, serializeError } from '../config/logger.js';
import { VerificationRequest } from '../models/VerificationRequest.js';

const LEASE_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export function createVerificationWorker({ deliver, clock = () => new Date(), shutdownTimeoutMs = 10_000 }) {
  let timer;
  let running;
  let stopped = false;
  const controller = new AbortController();

  async function processOne() {
    if (stopped) return false;
    const now = clock();
    const leaseId = randomUUID();
    const job = await VerificationRequest.findOneAndUpdate(
      { availableAt: { $lte: now }, expiresAt: { $gt: now }, attempts: { $lt: MAX_ATTEMPTS } },
      { $set: { leaseId, availableAt: new Date(now.getTime() + LEASE_MS) }, $inc: { attempts: 1 } },
      { returnDocument: 'after', sort: { availableAt: 1 } },
    );
    if (!job) return false;
    try {
      if (stopped) return false;
      await deliver({ email: job.email, requestedAt: job.createdAt, signal: controller.signal });
      if (controller.signal.aborted) return false;
      await VerificationRequest.deleteOne({ _id: job._id, leaseId });
    } catch (error) {
      if (controller.signal.aborted) return false;
      logger.error(serializeError(error), 'Verification request delivery failed');
      if (job.attempts >= MAX_ATTEMPTS) {
        await VerificationRequest.deleteOne({ _id: job._id, leaseId });
      } else {
        await VerificationRequest.updateOne({ _id: job._id, leaseId }, {
          $set: { availableAt: new Date(clock().getTime() + 60_000), leaseId: null },
        });
      }
    }
    return true;
  }

  function processNext() {
    if (stopped || running) return Promise.resolve(false);
    running = processOne().finally(() => { running = undefined; });
    return running;
  }

  function tick() {
    void processNext().catch(error => logger.error(serializeError(error), 'Verification worker failed'));
  }

  return {
    processNext,
    start() {
      if (timer || stopped) return;
      timer = setInterval(tick, 1000);
      timer.unref();
      tick();
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      timer = undefined;
      let deadline;
      try {
        await Promise.race([running, new Promise(resolve => {
          deadline = setTimeout(() => { controller.abort(); resolve(); }, shutdownTimeoutMs);
        })]);
      } finally {
        clearTimeout(deadline);
      }
    },
  };
}
