import { toCheckoutOrder } from '../checkout/checkout.presenter.js';

export function toOrder(order, { admin = false, latestRefund = null } = {}) {
  const dto = { ...toCheckoutOrder(order), paidAt: order.paidAt ?? null,
    latestRefund: latestRefund ? { id: String(latestRefund._id), kind: latestRefund.kind, status: latestRefund.status,
      amountMinor: latestRefund.amountMinor, currency: latestRefund.currency,
      createdAt: latestRefund.createdAt, completedAt: latestRefund.completedAt ?? null } : null };
  if (admin) Object.assign(dto, { studentId: order.studentId.toString(),
    instructorId: order.instructorId.toString(), commissionBps: order.commissionBps,
    platformAmountMinor: order.platformAmountMinor, instructorAmountMinor: order.instructorAmountMinor });
  return dto;
}
export function toPayment(payment) {
  if (!payment) return null;
  return { id: payment._id.toString(), provider: payment.provider, status: payment.status,
    amountMinor: payment.amountMinor, currency: payment.currency, paidAt: payment.paidAt ?? null };
}
