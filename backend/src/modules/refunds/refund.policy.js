import { ApiError } from '../../utils/ApiError.js';
import { splitCourseRevenue } from '../../utils/money.js';
import { financialDeadlines } from '../finance/finance.policy.js';

export const reconciliationRequired = () => new ApiError(409, 'FINANCIAL_RECONCILIATION_REQUIRED',
  'Financial evidence requires review before a refund can be requested');
export function assertRefundAdmission({ order, payment, policy, sale, now, overrideWindow }) {
  if (order.status === 'refunded' || payment?.status === 'refunded') {
    throw new ApiError(409, 'REFUND_ALREADY_COMPLETED', 'This payment has already been refunded');
  }
  if (order.status !== 'paid' || payment?.status !== 'succeeded') {
    throw new ApiError(409, 'REFUND_NOT_ALLOWED', 'A confirmed paid order is required');
  }
  const validDate = date => date instanceof Date && Number.isFinite(date.getTime());
  if (!payment || payment.provider !== 'stripe' || String(payment.orderId) !== String(order._id)
      || !/^pi_[A-Za-z0-9_]+$/.test(payment.paymentIntentId ?? '')
      || !Number.isSafeInteger(order.amountMinor) || order.amountMinor < 1 || order.currency !== 'EGP'
      || payment.amountMinor !== order.amountMinor || payment.currency !== order.currency
      || !Number.isSafeInteger(order.commissionBps) || order.commissionBps < 0 || order.commissionBps > 10000
      || !policy || String(policy._id) !== String(order.policyVersionId)
      || policy.refundMode !== 'full' || policy.refundWindowSeconds !== order.refundWindowSeconds
      || !validDate(policy.approvedAt) || !validDate(policy.effectiveFrom) || !validDate(order.createdAt)
      || policy.approvedAt > policy.effectiveFrom || policy.effectiveFrom > order.createdAt
      || !['product_delegation', 'admin_approval'].includes(policy.approvalSource)
      || (policy.approvalSource === 'admin_approval' && !policy.approvedBy)
      || !validDate(order.paymentConfirmedAt) || !validDate(payment.paymentConfirmedAt)
      || order.paymentConfirmedAt.getTime() !== payment.paymentConfirmedAt.getTime()
      || order.paymentConfirmedAt > now
      || order.paymentConfirmedAt.getTime() < Math.floor(order.createdAt.getTime() / 1000) * 1000
      || !validDate(order.refundDeadlineAt) || !Number.isSafeInteger(order.refundWindowSeconds)
      || order.refundWindowSeconds < 1 || order.refundWindowSeconds > 365 * 86400
      || !sale || !['pending', 'eligible', 'included_in_payout'].includes(sale.status) || String(sale.instructorId) !== String(order.instructorId)
      || String(sale.orderId) !== String(order._id) || sale.currency !== order.currency
      || sale.amountMinor !== order.instructorAmountMinor || String(sale.policyVersionId) !== String(policy._id)) {
    throw reconciliationRequired();
  }
  const split = splitCourseRevenue(order.amountMinor, order.commissionBps);
  if (split.platformAmountMinor !== order.platformAmountMinor || split.instructorAmountMinor !== order.instructorAmountMinor
      || financialDeadlines({ paymentConfirmedAt: order.paymentConfirmedAt,
        refundWindowSeconds: order.refundWindowSeconds }).refundDeadlineAt.getTime() !== order.refundDeadlineAt.getTime()) {
    throw reconciliationRequired();
  }
  if (overrideWindow && policy.lateAdminOverrideAllowed !== true) {
    throw new ApiError(409, 'REFUND_OVERRIDE_NOT_ALLOWED', 'This policy does not allow a refund-window exception');
  }
  if (now >= order.refundDeadlineAt && !overrideWindow) {
    throw new ApiError(409, 'REFUND_WINDOW_EXPIRED', 'The standard refund window has expired');
  }
}
