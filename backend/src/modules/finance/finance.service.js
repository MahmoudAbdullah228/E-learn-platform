import mongoose from 'mongoose';

import { FinancialHold } from '../../models/FinancialHold.js';
import { InstructorFinanceState } from '../../models/InstructorFinanceState.js';
import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { appendAuditEvent } from '../audit/audit.service.js';
import { financialIdSchema, holdInputSchema, holdResolutionSchema } from './finance.schemas.js';

const transactionOptions = { readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' }, maxCommitTimeMS: 10_000 };
const conflict = () => new ApiError(409, 'FINANCIAL_STATE_CONFLICT', 'The financial state requires review');

export function createFinanceFoundationService({ clock = () => new Date() } = {}) {
  const contexts = new WeakSet();
  function assertContext(context) {
    if (!context || !contexts.has(context) || !context.session.inTransaction()) {
      throw new TypeError('Financial work requires an active instructor transaction');
    }
  }
  async function initializeGuard(instructorId) {
    await InstructorFinanceState.init();
    if (await InstructorFinanceState.exists({ instructorId })) return;
    try { await InstructorFinanceState.create({ instructorId }); }
    catch (error) {
      if (error?.code !== 11000 || !error.keyPattern?.instructorId) throw error;
    }
  }
  async function auditHold(context, action, hold, actorId) {
    await appendAuditEvent({ session: context.session, occurredAt: context.now, input: {
      actorType: actorId ? 'user' : 'system', actorId,
      action, targetType: 'financial_hold', targetId: hold.id,
      fromStatus: action === 'financial_hold.opened' ? null : 'open',
      toStatus: action === 'financial_hold.opened' ? 'open' : 'resolved',
    } });
  }

  return Object.freeze({
    // The driver can retry work: callbacks must perform database operations only.
    async runForInstructor({ instructorId }, work) {
      instructorId = financialIdSchema.parse(instructorId);
      if (typeof work !== 'function') throw new TypeError('A database-only transaction callback is required');
      // This lock grants no role/actor permission. Preserve accounting for suspended or
      // deapproved existing users, but never create a financial account for an orphan ID.
      if (!await User.exists({ _id: instructorId })) {
        throw new ApiError(404, 'FINANCIAL_ACCOUNT_NOT_FOUND', 'The financial account was not found');
      }
      // A harmless revision-zero identity row may survive a later rollback. No financial
      // records, holds, claims, or audit events are written outside the actual transaction.
      await initializeGuard(instructorId);
      return mongoose.connection.transaction(async session => {
        const now = clock();
        if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('Invalid financial clock');
        const state = await InstructorFinanceState.findOneAndUpdate({ instructorId,
          revision: { $lt: Number.MAX_SAFE_INTEGER } }, { $inc: { revision: 1 } },
        { session, returnDocument: 'after', runValidators: true });
        if (!state) throw conflict();
        const context = Object.freeze({ session, instructorId, revision: state.revision, now: new Date(now) });
        contexts.add(context);
        try { return await work(context); }
        finally { contexts.delete(context); }
      }, transactionOptions);
    },

    async assertNoHolds(context) {
      assertContext(context);
      if (await FinancialHold.exists({ instructorId: context.instructorId, resolvedAt: null })
        .session(context.session)) {
        throw new ApiError(409, 'FINANCIAL_HOLD_ACTIVE', 'Unresolved financial work prevents this action');
      }
    },

    async openHold(context, input) {
      assertContext(context);
      const data = holdInputSchema.parse(input);
      const existing = await FinancialHold.findOne({ instructorId: context.instructorId,
        sourceType: data.sourceType, sourceId: data.sourceId }).session(context.session);
      if (existing) {
        if (existing.resolvedAt || existing.reasonCode !== data.reasonCode
            || (existing.paymentId?.toString() ?? null) !== data.paymentId) throw conflict();
        return existing;
      }
      const [hold] = await FinancialHold.create([{ ...data, instructorId: context.instructorId,
        openedAt: context.now }], { session: context.session });
      await auditHold(context, 'financial_hold.opened', hold, data.openedBy);
      return hold;
    },

    async resolveHold(context, input) {
      assertContext(context);
      const data = holdResolutionSchema.parse(input);
      const hold = await FinancialHold.findOne({ _id: data.holdId, instructorId: context.instructorId })
        .session(context.session);
      if (!hold || context.now < hold.openedAt) throw conflict();
      if (hold.resolvedAt) {
        if (hold.resolutionCode !== data.resolutionCode
            || (hold.resolvedBy?.toString() ?? null) !== data.resolvedBy) throw conflict();
        return hold;
      }
      const resolved = await FinancialHold.findOneAndUpdate({ _id: hold.id,
        instructorId: context.instructorId, resolvedAt: null, resolutionCode: null,
        ...(data.resolvedBy ? { resolvedBy: null } : {}) }, { $set: {
        resolvedAt: context.now, resolutionCode: data.resolutionCode,
        ...(data.resolvedBy ? { resolvedBy: data.resolvedBy } : {}),
      } }, { session: context.session, returnDocument: 'after', runValidators: true });
      if (!resolved) throw conflict();
      await auditHold(context, 'financial_hold.resolved', resolved, data.resolvedBy);
      return resolved;
    },
  });
}
