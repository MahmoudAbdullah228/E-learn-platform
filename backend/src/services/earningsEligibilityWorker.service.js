import { randomUUID } from 'node:crypto';

import { env } from '../config/env.js';
import { logger, serializeError } from '../config/logger.js';
import { EarningEntry } from '../models/EarningEntry.js';
import { financialIdSchema } from '../modules/finance/finance.schemas.js';
import { createEarningsEligibilityService } from '../modules/earnings/eligibility.service.js';
import { eligibilityWorkerOptionsSchema } from '../modules/earnings/earnings.schemas.js';

const leaseMs = 120_000;

export function createEarningsEligibilityWorker({ clock = () => new Date(),
  service = createEarningsEligibilityService({ clock }), intervalMs = env.EARNINGS_ELIGIBILITY_INTERVAL_MS,
  batchSize = env.EARNINGS_ELIGIBILITY_BATCH_SIZE, shutdownTimeoutMs = env.SHUTDOWN_TIMEOUT_MS } = {}) {
  eligibilityWorkerOptionsSchema.parse({ intervalMs, batchSize, shutdownTimeoutMs });
  const controller = new AbortController(); const { signal } = controller;
  let running; let draining; let timer;
  async function processOne({ entryId } = {}) {
    if (signal.aborted) return false;
    if (entryId) entryId = financialIdSchema.parse(entryId);
    const now = clock(); const leaseId = randomUUID();
    const entry = await EarningEntry.findOneAndUpdate({ ...(entryId ? { _id: entryId } : {}),
      status: 'pending', type: 'sale', payoutId: null, dependentOnPayoutId: null,
      $and: [{ $or: [{ eligibleAt: null }, { eligibleAt: { $lte: now } }] },
        ...(entryId ? [] : [{ $or: [{ eligibilityNextCheckAt: null }, { eligibilityNextCheckAt: { $lte: now } }] }]),
        { $or: [{ eligibilityLeaseUntil: null }, { eligibilityLeaseUntil: { $lte: now } }] },
        { $or: [{ eligibilityAttempts: { $exists: false } }, { eligibilityAttempts: { $lt: Number.MAX_SAFE_INTEGER } }] }],
    }, { $set: { eligibilityLeaseId: leaseId, eligibilityLeaseUntil: new Date(now.getTime() + leaseMs) },
      $inc: { eligibilityAttempts: 1 } },
    { returnDocument: 'after', sort: { eligibleAt: 1, _id: 1 }, writeConcern: { w: 'majority' }, maxTimeMS: 5000 })
      .select('+eligibilityAttempts');
    if (!entry || signal.aborted) return false;
    try {
      const result = await service.evaluate({ entryId: entry.id, leaseId }, { signal });
      if (!signal.aborted) logger.info({ entryId: entry.id, code: result.code, eligible: result.eligible }, 'Earnings eligibility decision');
    } catch (error) {
      if (signal.aborted || error?.code === 'EARNINGS_ELIGIBILITY_LEASE_LOST') return false;
      logger.error(serializeError(error), 'Earnings eligibility evaluation deferred');
      const failedAt = clock();
      await EarningEntry.updateOne({ _id: entry.id, status: 'pending', eligibilityLeaseId: leaseId,
        eligibilityLeaseUntil: { $gt: failedAt } }, { $set: { eligibilityLeaseId: null, eligibilityLeaseUntil: null,
        eligibilityCheckedAt: failedAt, eligibilityCheckCode: error?.code === 'FINANCIAL_ACCOUNT_NOT_FOUND'
          ? 'EARNINGS_ACCOUNT_REQUIRES_REVIEW' : 'EARNINGS_EVALUATION_UNAVAILABLE',
        eligibilityNextCheckAt: new Date(failedAt.getTime() + Math.min(60_000 * 2 ** Math.min(entry.eligibilityAttempts, 6), 3_600_000)) } },
      { writeConcern: { w: 'majority' }, runValidators: true, maxTimeMS: 5000 });
    }
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
      timer = setInterval(() => {
        if (draining || signal.aborted) return;
        draining = (async () => {
          for (let count = 0; count < batchSize && await processNext(); count++) { /* bounded drain */ }
        })().catch(error => logger.error(serializeError(error), 'Earnings eligibility worker failed'))
          .finally(() => { draining = undefined; });
      }, intervalMs); timer.unref();
    },
    async stop() {
      controller.abort(); clearInterval(timer);
      let deadline;
      try { await Promise.race([Promise.allSettled([running, draining]), new Promise(resolve => { deadline = setTimeout(resolve, shutdownTimeoutMs); })]); }
      finally { clearTimeout(deadline); }
    },
  });
}
