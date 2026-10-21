import { randomUUID } from 'node:crypto';

import { logger, serializeError } from '../config/logger.js';
import { WebhookEvent } from '../models/WebhookEvent.js';
import { createPaymentFulfillmentService } from '../modules/payments/paymentFulfillment.service.js';

const leaseMs = 120_000;
const maxAttempts = 8;
const terminalCodes = new Set(['PAYMENT_EVIDENCE_MISMATCH']);

// Cancellation detaches an outstanding SDK read. It cannot stop Stripe's request, but it
// prevents its late result from reaching fulfillment or writing retry state after shutdown.
function abortable(operation, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => { signal.throwIfAborted(); return operation(); })
      .then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export function createPaymentWebhookWorker({ provider, clock = () => new Date(),
  fulfillment = createPaymentFulfillmentService({ clock }), shutdownTimeoutMs = 10_000 } = {}) {
  let timer;
  let running;
  const controller = new AbortController();
  const { signal } = controller;

  async function processOne() {
    if (signal.aborted) return false;
    const now = clock();
    const leaseId = randomUUID();
    const job = await WebhookEvent.findOneAndUpdate({ provider: 'stripe',
      status: { $in: ['pending', 'processing'] }, attempts: { $lt: maxAttempts },
      availableAt: { $lte: now },
      $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }],
    }, { $set: { status: 'processing', leaseId, leaseUntil: new Date(now.getTime() + leaseMs) } },
    { returnDocument: 'after', sort: { availableAt: 1, _id: 1 },
      writeConcern: { w: 'majority' } }).select('+payload +leaseId');
    if (!job || signal.aborted) return false;
    try {
      const current = await abortable(() => provider.retrieveCheckoutSession(job.payload.sessionId), signal);
      signal.throwIfAborted();
      await fulfillment.fulfill({ job, current, signal });
    } catch (error) {
      if (signal.aborted) return false; // Leave lease for recovery; shutdown is not a failed attempt.
      if (error?.code === 'PAYMENT_EVENT_LEASE_LOST') return false;
      logger.error(serializeError(error), 'Payment webhook processing failed');
      const failedAt = clock();
      const terminal = terminalCodes.has(error?.code) || job.attempts + 1 >= maxAttempts;
      const safeCode = terminalCodes.has(error?.code) ? error.code
        : error?.code === 'PAYMENT_EVIDENCE_PENDING' ? error.code : 'PAYMENT_PROCESSING_FAILED';
      await WebhookEvent.updateOne({ _id: job._id, status: 'processing', leaseId,
        leaseUntil: { $gt: failedAt } }, { $inc: { attempts: 1 }, $set: {
        status: terminal ? 'failed' : 'pending', lastError: safeCode,
        leaseId: null, leaseUntil: null,
        availableAt: new Date(failedAt.getTime() + Math.min(2 ** (job.attempts + 1) * 5000, 3_600_000)),
      } }, { writeConcern: { w: 'majority' } });
    }
    return true;
  }

  function processNext() {
    if (signal.aborted || running) return Promise.resolve(false);
    running = processOne().catch(error => {
      if (signal.aborted) return false;
      throw error;
    }).finally(() => { running = undefined; });
    return running;
  }

  return Object.freeze({
    processNext,
    start() {
      if (timer || signal.aborted) return;
      timer = setInterval(() => {
        void (async () => {
          for (let count = 0; count < 10 && await processNext(); count += 1) { /* bounded drain */ }
        })().catch(error => logger.error(serializeError(error), 'Payment inbox worker failed'));
      }, 5000);
      timer.unref();
    },
    async stop() {
      controller.abort();
      clearInterval(timer);
      let deadline;
      try {
        await Promise.race([running, new Promise(resolve => {
          deadline = setTimeout(resolve, shutdownTimeoutMs);
        })]);
      } finally { clearTimeout(deadline); }
    },
  });
}
