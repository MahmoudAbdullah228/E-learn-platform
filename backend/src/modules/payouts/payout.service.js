import { createHash } from 'node:crypto';
import mongoose from 'mongoose';

import { EarningEntry } from '../../models/EarningEntry.js';
import { FinancialHold } from '../../models/FinancialHold.js';
import { InstructorFinanceState } from '../../models/InstructorFinanceState.js';
import { Payout } from '../../models/Payout.js';
import { PayoutItem } from '../../models/PayoutItem.js';
import { fenceActiveAdmin } from '../../services/adminAuthorization.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { createKeysetCursor } from '../../utils/keysetCursor.js';
import { appendAuditEvent } from '../audit/audit.service.js';
import { createEligibilityBalanceService } from '../earnings/eligibilityBalance.service.js';
import { createFinanceFoundationService } from '../finance/finance.service.js';
import { createPayoutSchema, payoutKeySchema, payoutPeriodSchema } from './payout.schemas.js';
import { toPayout, toPayoutItem, toPayoutReceipt } from './payout.presenter.js';
import { createPayoutLifecycleService, fencePayoutAdmission, selectionCutoff } from './payoutLifecycle.service.js';
import { payoutConflict, payoutItemLimit } from './payoutLedger.service.js';

const snapshot = work => mongoose.connection.transaction(work, {
  readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 10_000,
});
const cursor = createKeysetCursor({ namespace: 'admin-payouts:v1',
  normalizeFilters: ({ instructorId, status }) => ({ instructorId: instructorId ?? null, status: status ?? null }) });
export function createPayoutService({ clock = () => new Date(), capacity = payoutItemLimit } = {}) {
  const finance = createFinanceFoundationService({ clock });
  const balances = createEligibilityBalanceService({ clock, capacity });
  return Object.freeze({
    transition: createPayoutLifecycleService({ finance, balances }),
    async preview({ instructorId, period }) {
      return snapshot(async session => {
        const now = clock();
        if (period.cutoffAt > now) throw new ApiError(400, 'INVALID_FINANCIAL_CUTOFF', 'Cutoff must not be in the future');
        const { balance } = await balances.read({ instructorId, cutoffAt: selectionCutoff(period) }, { session, now });
        return { ...balance, ...period };
      });
    },
    async create({ auth, input, idempotencyKey }) {
      const { instructorId, ...periodInput } = createPayoutSchema.parse(input);
      const period = payoutPeriodSchema.parse(periodInput);
      const key = payoutKeySchema.parse(idempotencyKey);
      const requestFingerprint = createHash('sha256').update(JSON.stringify({ instructorId, ...period })).digest('hex');
      const identity = { createdBy: auth.userId, idempotencyKey: key };
      // Use the stored instructor for retries, including a retry with changed input.
      const hint = await Payout.findOne(identity).select('instructorId').lean().maxTimeMS(5000);
      return finance.runForInstructor({ instructorId: String(hint?.instructorId ?? instructorId) }, async ({ session, now }) => {
        await fenceActiveAdmin({ auth, session, now });
        const prior = await Payout.findOne(identity).select('+requestFingerprint').session(session).maxTimeMS(5000);
        if (prior) {
          if (prior.requestFingerprint !== requestFingerprint) {
            throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'The key was already used for a different payout request');
          }
          return { payout: toPayoutReceipt(prior), replayed: true };
        }
        if (period.cutoffAt > now) throw new ApiError(400, 'INVALID_FINANCIAL_CUTOFF', 'Cutoff must not be in the future');
        await fencePayoutAdmission({ instructorId, session });
        const { balance, entries } = await balances.read({ instructorId, cutoffAt: selectionCutoff(period) }, { session, now });
        if (balance.reasonCodes.includes('PAYOUT_ACTIVE')) {
          throw new ApiError(409, 'PAYOUT_ACTIVE', 'This instructor already has an active payout');
        }
        if (balance.blocked) throw new ApiError(409, 'PAYOUT_BLOCKED', 'Unresolved financial work prevents reservation',
          balance.reasonCodes.map(code => ({ code })));
        if (balance.netEligibleMinor <= 0) {
          throw new ApiError(409, 'PAYOUT_NON_POSITIVE_BALANCE', 'The net eligible balance must be positive');
        }
        const [payout] = await Payout.create([{ ...identity, ...period, requestFingerprint, instructorId,
          currency: balance.currency, amountMinor: balance.netEligibleMinor, lineCount: entries.length, createdAt: now }], { session });
        const state = await InstructorFinanceState.updateOne({ instructorId, activePayoutId: null },
          { $set: { activePayoutId: payout._id } }, { session });
        if (state.modifiedCount !== 1) throw payoutConflict();
        const claims = await EarningEntry.updateMany({ _id: { $in: entries.map(entry => entry._id) }, instructorId,
          currency: payout.currency, status: 'eligible', payoutId: null },
        { $set: { status: 'included_in_payout', payoutId: payout._id } }, { session, maxTimeMS: 5000 });
        if (claims.modifiedCount !== entries.length) throw payoutConflict();
        await PayoutItem.insertMany(entries.map(entry => ({
          payoutId: payout._id, earningEntryId: entry._id, instructorId,
          amountMinor: entry.amountMinor, type: entry.type, currency: entry.currency,
        })), { session });
        await appendAuditEvent({ session, occurredAt: now, input: {
          actorType: 'user', actorId: auth.userId, action: 'payout.created', targetType: 'payout',
          targetId: payout.id, toStatus: 'draft', idempotencyKey: key, requestFingerprint,
          result: { resourceId: payout.id, status: 'draft', revision: 0, httpStatus: 201 },
        } });
        return { payout: toPayoutReceipt(payout), replayed: false };
      });
    },
    async list(filters) {
      const { instructorId, status, limit } = filters;
      const after = cursor.decode(filters.cursor, filters);
      const filter = { ...(instructorId && { instructorId }), ...(status && { status }) };
      if (after) filter.$or = [{ createdAt: { $lt: after.createdAt } },
        { createdAt: after.createdAt, _id: { $lt: after.id } }];
      return snapshot(async session => {
        const rows = await Payout.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1)
          .session(session).lean().maxTimeMS(5000);
        const page = rows.slice(0, limit);
        const held = new Set((await FinancialHold.distinct('instructorId', {
          instructorId: { $in: page.map(row => row.instructorId) }, resolvedAt: null,
        }).session(session).maxTimeMS(5000)).map(String));
        return { payouts: page.map(row => toPayout(row, held.has(String(row.instructorId)))),
          pagination: { hasMore: rows.length > limit,
            nextCursor: rows.length > limit ? cursor.encode(page.at(-1), filters) : null } };
      });
    },
    async get(payoutId) {
      return snapshot(async session => {
        const payout = await Payout.findById(payoutId).session(session).lean().maxTimeMS(5000);
        if (!payout) throw new ApiError(404, 'PAYOUT_NOT_FOUND', 'Payout was not found');
        const items = await PayoutItem.find({ payoutId }).sort({ earningEntryId: 1 }).limit(payoutItemLimit + 1)
          .session(session).lean().maxTimeMS(5000);
        if (items.length > payoutItemLimit || items.length !== payout.lineCount) throw payoutConflict();
        const held = await FinancialHold.exists({ instructorId: payout.instructorId, resolvedAt: null })
          .session(session).maxTimeMS(5000);
        return { payout: toPayout(payout, Boolean(held)), items: items.map(toPayoutItem) };
      });
    },
  });
}
