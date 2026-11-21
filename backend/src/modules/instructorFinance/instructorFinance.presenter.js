export function toInstructorSale(order, refund) {
  return { id: String(order._id), courseId: String(order.courseId), courseTitle: order.courseTitleSnapshot,
    status: order.status, currency: order.currency, amountMinor: order.amountMinor,
    platformCommissionMinor: order.platformAmountMinor, instructorEarnedMinor: order.instructorAmountMinor,
    paidAt: order.paidAt, paymentConfirmedAt: order.paymentConfirmedAt ?? null,
    refund: refund ? { amountMinor: refund.amountMinor, completedAt: refund.completedAt } : null };
}

export function toInstructorEarning(entry, payout) {
  return { id: String(entry._id), orderId: String(entry.orderId), type: entry.type, status: entry.status,
    amountMinor: entry.amountMinor, currency: entry.currency, createdAt: entry.createdAt,
    eligibleAt: entry.eligibleAt ?? null, payout: payout ? { id: String(payout._id), status: payout.status } : null };
}

export function toInstructorPayout(payout) {
  return { id: String(payout._id), status: payout.status, currency: payout.currency, amountMinor: payout.amountMinor,
    lineCount: payout.lineCount, periodStart: payout.periodStart, periodEnd: payout.periodEnd, cutoffAt: payout.cutoffAt,
    createdAt: payout.createdAt, paidAt: payout.paidAt ?? null, cancelledAt: payout.cancelledAt ?? null,
    simulated: payout.transferMethod === 'test_simulation' };
}
