export function toPayoutReceipt(payout) {
  return {
    id: String(payout._id), instructorId: String(payout.instructorId),
    currency: payout.currency, amountMinor: payout.amountMinor, lineCount: payout.lineCount,
    periodStart: payout.periodStart, periodEnd: payout.periodEnd, cutoffAt: payout.cutoffAt,
    createdAt: payout.createdAt, revision: 0, status: 'draft',
  };
}

export function toPayout(payout, hasActiveHolds) {
  return { ...toPayoutReceipt(payout), revision: payout.revision, status: payout.status, hasActiveHolds,
    sealedAt: payout.sealedAt ?? null, sealedBy: payout.sealedBy ? String(payout.sealedBy) : null,
    transferAttemptId: payout.transferAttemptId ?? null,
    transferMethod: payout.transferMethod ?? null, transferOutcome: payout.transferOutcome,
    transferReference: payout.transferReference ?? null, paidAt: payout.paidAt ?? null, cancelledAt: payout.cancelledAt ?? null };
}

export function toPayoutItem(item) {
  return {
    earningEntryId: String(item.earningEntryId), amountMinor: item.amountMinor,
    currency: item.currency, type: item.type,
  };
}
