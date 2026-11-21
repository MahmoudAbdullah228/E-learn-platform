import { randomUUID } from 'node:crypto';

import { env } from '../config/env.js';
import { logger, serializeError } from '../config/logger.js';
import { Refund } from '../models/Refund.js';
import { createFinanceFoundationService } from '../modules/finance/finance.service.js';
import { createRefundInboxService } from '../modules/refunds/refundInbox.service.js';
import { createRefundIssuanceService } from '../modules/refunds/refundIssuance.service.js';
import { refundObservationSchema } from '../modules/refunds/refundEvent.schemas.js';
import { financialIdSchema } from '../modules/finance/finance.schemas.js';

const maximumAttempts = 8;
const fields = '+paymentIntentId +providerRefundId +dispatchStartedAt +recoveryLeaseId +recoveryAttempts';

function abortable(work, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => { signal.throwIfAborted(); return work(); }).then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

// Recovery reads provider truth. A dispatched command is never POSTed again, even
// after Stripe's idempotency retention expires. Observations use the existing inbox.
export function createRefundRecoveryWorker({ provider, clock = () => new Date(),
  issuanceEnabled = env.REFUND_PROCESSING_ENABLED, shutdownTimeoutMs = 10_000,
  operationTimeoutMs = env.STRIPE_API_TIMEOUT_MS + 1000 } = {}) {
  const controller = new AbortController();
  const { signal } = controller;
  const inbox = createRefundInboxService({ clock });
  const issuance = createRefundIssuanceService({ provider, finance: createFinanceFoundationService({ clock }),
    shutdownSignal: signal, operationTimeoutMs });
  let running; let timer;

  async function processOne({ refundId, allowIssue = true } = {}) {
    if (signal.aborted) return false;
    if (refundId) refundId = financialIdSchema.parse(refundId);
    const now = clock(); const recoveryLeaseId = randomUUID();
    const row = await Refund.findOneAndUpdate({ ...(refundId ? { _id: refundId } : {}),
      status: { $in: ['requested', 'processing', 'pending', 'requires_reconciliation'] },
      revision: { $lt: Number.MAX_SAFE_INTEGER },
      $and: [{ $or: [{ nextRecoveryAt: null }, { nextRecoveryAt: { $lte: now } }] },
        { $or: [{ recoveryAttempts: { $exists: false } }, { recoveryAttempts: { $lt: refundId ? Number.MAX_SAFE_INTEGER : maximumAttempts } }] },
        { $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }] },
        { $or: [{ recoveryLeaseUntil: null }, { recoveryLeaseUntil: { $lte: now } }] }],
      ...(issuanceEnabled && allowIssue ? {} : { $or: [{ dispatchStartedAt: { $ne: null } }, { providerRefundId: { $type: 'string' } }] }),
    }, { $set: { recoveryLeaseId, recoveryLeaseUntil: new Date(now.getTime() + 120_000) } },
    { returnDocument: 'after', sort: { nextRecoveryAt: 1, _id: 1 }, writeConcern: { w: 'majority' } }).select(fields);
    if (!row || signal.aborted) return false;
    const operationSignal = AbortSignal.any([signal, AbortSignal.timeout(operationTimeoutMs)]);
    let failureCode = null;
    try {
      if (row.status === 'requested' && !row.dispatchStartedAt) {
        await issuance.issue({ refundId: row.id, instructorId: String(row.instructorId) });
      } else {
        const observations = row.providerRefundId
          ? [await abortable(() => provider.retrieveRefundObservation({ providerRefundId: row.providerRefundId,
            paymentIntentId: row.paymentIntentId }, { signal: operationSignal }), operationSignal)]
          : await abortable(() => provider.scanRefundObservations({ paymentIntentId: row.paymentIntentId },
            { signal: operationSignal }), operationSignal);
        // Validate the whole bounded scan before persisting any of its observations.
        if (!Array.isArray(observations) || observations.length > 500) throw new Error('Invalid refund scan');
        const parsed = observations.map(value => refundObservationSchema.parse(value));
        if (new Set(parsed.map(value => value.providerRefundId)).size !== parsed.length
            || parsed.some(value => value.paymentIntentId !== row.paymentIntentId)) throw new Error('Invalid refund scan');
        let matched = false;
        for (const observation of parsed) {
          operationSignal.throwIfAborted();
          await inbox.recordObservation(observation, { signal: operationSignal });
          if (observation.providerRefundId === row.providerRefundId
              || observation.correlation?.refundId === row.id) matched = true;
        }
        if (!matched) failureCode = 'REFUND_OUTCOME_UNKNOWN';
      }
    } catch (error) {
      if (signal.aborted) return false;
      logger.error(serializeError(error), 'Refund recovery requires another observation');
      failureCode = 'REFUND_RECOVERY_UNAVAILABLE';
    }
    if (signal.aborted) return false;
    const finishedAt = clock();
    await Refund.updateOne({ _id: row.id, recoveryLeaseId, recoveryLeaseUntil: { $gt: finishedAt },
      revision: { $lt: Number.MAX_SAFE_INTEGER }, status: { $in: ['requested', 'processing', 'pending', 'requires_reconciliation'] } },
    { $set: { recoveryLeaseId: null, recoveryLeaseUntil: null,
      nextRecoveryAt: new Date(finishedAt.getTime() + Math.min(60_000 * 2 ** row.recoveryAttempts, 3_600_000)),
      ...(failureCode ? { status: 'requires_reconciliation', failureCode } : {}) },
    $inc: { recoveryAttempts: 1, revision: 1 } }, { writeConcern: { w: 'majority' } });
    return true;
  }
  function processNext(options) {
    if (running || signal.aborted) return Promise.resolve(false);
    running = processOne(options).catch(error => { if (signal.aborted) return false; throw error; })
      .finally(() => { running = undefined; });
    return running;
  }
  return Object.freeze({
    processNext,
    start() {
      if (timer || signal.aborted) return;
      timer = setInterval(() => { void processNext().catch(error => logger.error(serializeError(error), 'Refund recovery worker failed')); }, 5000);
      timer.unref();
    },
    async stop() {
      controller.abort(); clearInterval(timer);
      let deadline;
      try { await Promise.race([running, new Promise(resolve => { deadline = setTimeout(resolve, shutdownTimeoutMs); })]); }
      finally { clearTimeout(deadline); }
    },
  });
}
