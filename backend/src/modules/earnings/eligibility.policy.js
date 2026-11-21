import { financialDeadlines } from '../finance/finance.policy.js';
import { financialPolicyInputSchema } from '../finance/finance.schemas.js';
import { splitCourseRevenue } from '../../utils/money.js';

const same = (left, right) => left != null && right != null && String(left) === String(right);
const date = value => value instanceof Date && Number.isFinite(value.getTime());
const review = code => ({ code, eligible: false, deadline: null });

// This consumes persisted trusted facts, not current environment defaults or paidAt.
export function evaluateSaleEligibility({ entry, order, payment, policy, now, reservedPayoutId }) {
  if (!date(now)) throw new TypeError('A valid eligibility clock is required');
  if (!order?.policyVersionId || !entry.policyVersionId || !date(order?.paymentConfirmedAt)
      || !date(payment?.paymentConfirmedAt)) return review('EARNINGS_LEGACY_REQUIRES_REVIEW');
  const approved = policy && financialPolicyInputSchema.safeParse({ version: policy.version,
    effectiveFrom: policy.effectiveFrom, refundWindowSeconds: policy.refundWindowSeconds, refundMode: policy.refundMode,
    lateAdminOverrideAllowed: policy.lateAdminOverrideAllowed, eligibilityRule: policy.eligibilityRule,
    approvalSource: policy.approvalSource, approvedBy: policy.approvedBy ? String(policy.approvedBy) : null,
    approvedAt: policy.approvedAt, approvalReference: policy.approvalReference });
  const unreserved = ['pending', 'eligible'].includes(entry.status) && !entry.payoutId;
  const reserved = entry.status === 'included_in_payout' && same(entry.payoutId, reservedPayoutId);
  if (!approved?.success || !same(order.policyVersionId, policy._id) || !same(entry.policyVersionId, policy._id)
      || !date(order.createdAt) || policy.effectiveFrom > order.createdAt
      || order.refundWindowSeconds !== policy.refundWindowSeconds
      || entry.type !== 'sale' || (!unreserved && !reserved) || entry.refundId || entry.dependentOnPayoutId
      || !same(entry.orderId, order._id) || !same(entry.instructorId, order.instructorId)
      || order.status !== 'paid' || order.purchaseSlotActive !== true || payment?.status !== 'succeeded'
      || payment.provider !== 'stripe' || !same(payment.orderId, order._id)
      || !/^pi_[A-Za-z0-9_]+$/.test(payment.paymentIntentId ?? '')
      || order.currency !== 'EGP' || payment.currency !== order.currency || entry.currency !== order.currency
      || !Number.isSafeInteger(order.amountMinor) || order.amountMinor <= 0 || payment.amountMinor !== order.amountMinor
      || !Number.isSafeInteger(order.commissionBps) || order.commissionBps < 0 || order.commissionBps > 10000
      || !Number.isSafeInteger(entry.amountMinor) || entry.amountMinor < 0 || entry.amountMinor !== order.instructorAmountMinor
      || order.paymentConfirmedAt.getTime() !== payment.paymentConfirmedAt.getTime()
      || order.paymentConfirmedAt > now || order.paymentConfirmedAt.getTime() < Math.floor(order.createdAt.getTime() / 1000) * 1000) {
    return review('EARNINGS_EVIDENCE_REQUIRES_REVIEW');
  }
  const split = splitCourseRevenue(order.amountMinor, order.commissionBps);
  const { eligibleAt: deadline } = financialDeadlines({ paymentConfirmedAt: order.paymentConfirmedAt,
    refundWindowSeconds: order.refundWindowSeconds });
  if (split.platformAmountMinor !== order.platformAmountMinor || split.instructorAmountMinor !== order.instructorAmountMinor
      || !date(order.refundDeadlineAt) || order.refundDeadlineAt.getTime() !== deadline.getTime()
      || (entry.eligibleAt != null && (!date(entry.eligibleAt) || entry.eligibleAt.getTime() !== deadline.getTime()))) {
    return review('EARNINGS_EVIDENCE_REQUIRES_REVIEW');
  }
  return { eligible: now >= deadline, deadline, code: now >= deadline ? 'ELIGIBLE' : 'REFUND_WINDOW_OPEN' };
}
