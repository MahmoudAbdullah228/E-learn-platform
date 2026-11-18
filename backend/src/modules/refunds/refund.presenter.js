export function toAcceptedRefund(refund) {
  // Rebuild the original immutable 202 receipt, never replay the current mutable status.
  return { id: String(refund._id), orderId: String(refund.orderId), amountMinor: refund.amountMinor,
    currency: refund.currency, status: 'requested', createdAt: refund.createdAt };
}
export function toRefund(refund) {
  const failureCode = refund.failureCode == null ? null
    : ['REFUND_PROVIDER_UNAVAILABLE', 'REFUND_EVIDENCE_MISMATCH', 'REFUND_PROCESSING_FAILED'].includes(refund.failureCode)
      ? refund.failureCode : 'REFUND_REQUIRES_REVIEW';
  return { ...toAcceptedRefund(refund), status: refund.status,
    completedAt: refund.completedAt ?? null, updatedAt: refund.updatedAt, failureCode };
}
