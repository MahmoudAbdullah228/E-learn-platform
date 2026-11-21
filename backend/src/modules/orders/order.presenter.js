import { toCheckoutOrder } from '../checkout/checkout.presenter.js';

function toOrderRefund(refund) {
  return { id: String(refund._id), kind: refund.kind, status: refund.status,
    amountMinor: refund.amountMinor, currency: refund.currency,
    createdAt: refund.createdAt, completedAt: refund.completedAt ?? null };
}

export function toOrder(order, { admin = false, latestRefund = null } = {}) {
  const dto = { ...toCheckoutOrder(order), paidAt: order.paidAt ?? null,
    latestRefund: latestRefund ? toOrderRefund(latestRefund) : null };
  if (admin) Object.assign(dto, { studentId: order.studentId.toString(),
    instructorId: order.instructorId.toString(), commissionBps: order.commissionBps,
    platformAmountMinor: order.platformAmountMinor, instructorAmountMinor: order.instructorAmountMinor });
  return dto;
}

const safeReference = (value, pattern) => typeof value === 'string' && value.length <= 255
  && pattern.test(value) && !/_secret_/i.test(value) ? value : null;

export function toAdminOrderPayment(payment) {
  if (!payment) return null;
  return { ...toPayment(payment), paymentConfirmedAt: payment.paymentConfirmedAt ?? null,
    paymentIntentId: safeReference(payment.paymentIntentId, /^pi_[A-Za-z0-9_]+$/),
    checkoutSessionId: safeReference(payment.checkoutSessionId, /^cs_(?:test|live)_[A-Za-z0-9_]+$/) };
}

export function toAdminOrderRefund(refund) {
  return { ...toOrderRefund(refund), providerRefundId: safeReference(refund.providerRefundId, /^re_[A-Za-z0-9_]+$/) };
}
export function toPayment(payment) {
  if (!payment) return null;
  return { id: payment._id.toString(), provider: payment.provider, status: payment.status,
    amountMinor: payment.amountMinor, currency: payment.currency, paidAt: payment.paidAt ?? null };
}
