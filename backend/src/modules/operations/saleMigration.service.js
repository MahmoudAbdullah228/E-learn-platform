import mongoose from 'mongoose';
import { migrationOptions } from './operations.schemas.js';

import { EarningEntry } from '../../models/EarningEntry.js';
import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { duplicateGroups, requiredUniqueIndexesReady } from './financialPreflight.service.js';
import { FinancialHold } from '../../models/FinancialHold.js';
import { FinancialPolicyVersion } from '../../models/FinancialPolicyVersion.js';
import { User } from '../../models/User.js';
import { evaluateSaleEligibility } from '../earnings/eligibility.policy.js';
import { createFinanceFoundationService } from '../finance/finance.service.js';

async function evidence(entry, session, now) {
  if (!mongoose.isObjectIdOrHexString(entry.orderId) || !mongoose.isObjectIdOrHexString(entry.policyVersionId)) {
    return { deadline: null, code: 'EARNINGS_LEGACY_REQUIRES_REVIEW' };
  }
  const order = await Order.findById(entry.orderId).session(session).lean();
  const payment = await Payment.findOne({ orderId: entry.orderId }).select('+paymentIntentId').session(session).lean();
  const policy = await FinancialPolicyVersion.findById(entry.policyVersionId ?? null).session(session).lean();
  return evaluateSaleEligibility({ order, payment, policy, entry, now });
}

export async function migrateSales(options) {
  const { after, limit, apply } = migrationOptions.parse(options);
  const duplicates = await duplicateGroups();
  if (Object.values(duplicates).some(Boolean)) return { blocked: true, duplicates };
  if (apply && !await requiredUniqueIndexesReady()) return { blocked: true, indexesRequireReview: true };
  const filter = { type: 'sale', status: { $in: ['pending', 'eligible'] }, payoutId: null,
    ...(after ? { _id: { $gt: new mongoose.Types.ObjectId(after) } } : {}) };
  const rows = await EarningEntry.find(filter).sort({ _id: 1 }).limit(limit + 1).lean();
  const report = { scanned: 0, backfill: 0, review: 0, orphans: 0, nextAfter: null };
  const finance = createFinanceFoundationService();
  for (const entry of rows.slice(0, limit)) {
    report.scanned++;
    if (!mongoose.isObjectIdOrHexString(entry.instructorId) || !await User.exists({ _id: entry.instructorId })) { report.orphans++; continue; }
    const decision = await evidence(entry, null, new Date());
    if (decision.deadline && entry.eligibleAt) continue;
    const sourceId = 'migration:' + entry._id;
    if (decision.deadline) report.backfill++;
    else report.review++;
    if (!apply || (!decision.deadline && await FinancialHold.exists({ instructorId: entry.instructorId,
      sourceType: 'legacy', sourceId: { $regex: '^' + sourceId + '(?::r[0-9]+)?$' }, resolvedAt: null }))) continue;
    await finance.runForInstructor({ instructorId: String(entry.instructorId) }, async context => {
      const current = await EarningEntry.findOne({ ...filter, _id: entry._id, instructorId: entry.instructorId })
        .session(context.session).lean();
      if (!current) return;
      const checked = await evidence(current, context.session, context.now);
      if (!checked.deadline) {
        const holds = { instructorId: entry.instructorId, sourceType: 'legacy',
          sourceId: { $regex: '^' + sourceId + '(?::r[0-9]+)?$' } };
        if (!await FinancialHold.exists({ ...holds, resolvedAt: null }).session(context.session)) {
          const prior = await FinancialHold.exists(holds).session(context.session);
          await finance.openHold(context, { sourceType: 'legacy', sourceId: prior ? sourceId + ':r' + context.revision : sourceId,
            reasonCode: checked.code });
        }
      } else if (!current.eligibleAt) {
        await EarningEntry.updateOne({ _id: entry._id, eligibleAt: null }, { $set: { eligibleAt: checked.deadline } },
          { session: context.session, runValidators: true });
      }
    });
  }
  if (rows.length > limit) report.nextAfter = String(rows[limit - 1]._id);
  return report;
}
