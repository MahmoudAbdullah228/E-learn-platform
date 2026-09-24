import { randomUUID } from 'node:crypto';

import { logger, serializeError } from '../config/logger.js';
import { VerificationRequest } from '../models/VerificationRequest.js';

const LEASE_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export function createVerificationWorker({ deliver, clock = () => new Date() }) {
  let timer;
  let running;
  let stopped = false;

  async function processNext() {
    const now = clock();
    const leaseId = randomUUID();
    const job = await VerificationRequest.findOneAndUpdate(
      { availableAt: { $lte: now }, expiresAt: { $gt: now }, attempts: { $lt: MAX_ATTEMPTS } },
      { $set: { leaseId, availableAt: new Date(now.getTime() + LEASE_MS) }, $inc: { attempts: 1 } },
      { returnDocument: 'after', sort: { availableAt: 1 } },
    );
    if (!job) return false;
    try {
      await deliver({ email: job.email });
      await VerificationRequest.deleteOne({ _id: job._id, leaseId });
    } catch (error) {
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

  function tick() {
    if (stopped || running) return;
    running = processNext()
      .catch(error => logger.error(serializeError(error), 'Verification worker failed'))
      .finally(() => { running = undefined; });
  }

  return {
    processNext,
    start() {
      if (timer) return;
      stopped = false;
      timer = setInterval(tick, 1000);
      timer.unref();
      tick();
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      timer = undefined;
      await running;
    },
  };
}
