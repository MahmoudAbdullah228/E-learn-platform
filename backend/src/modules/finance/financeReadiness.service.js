import mongoose from 'mongoose';
import { z } from 'zod';

import { FinancialPolicyVersion } from '../../models/FinancialPolicyVersion.js';
import { Order } from '../../models/Order.js';
import { splitCourseRevenue } from '../../utils/money.js';
import { financialIdSchema } from './finance.schemas.js';

const inputSchema = z.object({ afterId: financialIdSchema.optional(),
  limit: z.number().int().min(1).max(500).default(100) }).strict();

// Bounded read-only diagnostic. It never maps a legacy policy, changes eligibility,
// fetches provider history or treats the existing processing paidAt as confirmation.
export async function inspectFinancialFoundation(input = {}) {
  const { afterId, limit } = inputSchema.parse(input);
  return mongoose.connection.transaction(async session => {
    const orders = await Order.find({ status: { $in: ['paid', 'refunded'] },
      ...(afterId ? { _id: { $gt: afterId } } : {}) }).sort({ _id: 1 }).limit(limit + 1)
      .select('_id currency amountMinor commissionBps platformAmountMinor instructorAmountMinor policyVersionId '
        + 'refundWindowSeconds paymentConfirmedAt refundDeadlineAt').session(session).lean();
    const page = orders.slice(0, limit);
    const policies = await FinancialPolicyVersion.find({ _id: { $in: page
      .filter(order => order.policyVersionId).map(order => order.policyVersionId) } })
      .select('_id refundWindowSeconds').session(session).lean();
    const policyById = new Map(policies.map(policy => [String(policy._id), policy]));
    const findings = page.flatMap(order => {
      const reasonCodes = [];
      if (order.currency !== 'EGP') reasonCodes.push('CURRENCY_REQUIRES_REVIEW');
      if (!order.policyVersionId) reasonCodes.push('MISSING_POLICY');
      else {
        const policy = policyById.get(String(order.policyVersionId));
        if (!policy) reasonCodes.push('POLICY_NOT_FOUND');
        else if (order.refundWindowSeconds !== policy.refundWindowSeconds) reasonCodes.push('POLICY_WINDOW_MISMATCH');
      }
      const confirmation = order.paymentConfirmedAt;
      if (!(confirmation instanceof Date) || !Number.isFinite(confirmation.getTime())) {
        reasonCodes.push('MISSING_CONFIRMATION');
      }
      const window = order.refundWindowSeconds;
      const expectedDeadline = confirmation instanceof Date && Number.isSafeInteger(window) && window > 0
        ? confirmation.getTime() + window * 1000 : NaN;
      if (!(order.refundDeadlineAt instanceof Date)
          || order.refundDeadlineAt.getTime() !== expectedDeadline) reasonCodes.push('DEADLINE_REQUIRES_REVIEW');
      if (!Number.isSafeInteger(order.amountMinor) || order.amountMinor < 1
          || !Number.isSafeInteger(order.commissionBps) || order.commissionBps < 0 || order.commissionBps > 10000) {
        reasonCodes.push('INVALID_REVENUE_SPLIT');
      } else {
        const split = splitCourseRevenue(order.amountMinor, order.commissionBps);
        if (order.platformAmountMinor !== split.platformAmountMinor
            || order.instructorAmountMinor !== split.instructorAmountMinor) reasonCodes.push('INVALID_REVENUE_SPLIT');
      }
      return reasonCodes.length ? [{ orderId: String(order._id), reasonCodes }] : [];
    });
    return { dryRun: true, scanned: page.length, requiresReview: findings.length, findings,
      nextCursor: orders.length > limit ? String(page.at(-1)._id) : null };
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 10_000 });
}
