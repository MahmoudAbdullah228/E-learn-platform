export function toPayoutReceipt(payout) {
  return {
    id: String(payout._id), instructorId: String(payout.instructorId),
    currency: payout.currency, amountMinor: payout.amountMinor, lineCount: payout.lineCount,
    periodStart: payout.periodStart, periodEnd: payout.periodEnd, cutoffAt: payout.cutoffAt,
    createdAt: payout.createdAt, revision: 0, status: 'draft',
  };
}

export function toPayout(payout, hasActiveHolds) {
  return { ...toPayoutReceipt(payout), revision: payout.revision, status: payout.status, hasActiveHolds };
}

export function toPayoutItem(item) {
  return {
    earningEntryId: String(item.earningEntryId), amountMinor: item.amountMinor,
    currency: item.currency, type: item.type,
  };
}
