import { ApiError } from '../../utils/ApiError.js';
import { deadlineInputSchema } from './finance.schemas.js';

const transitions = {
  refund: {
    requested: ['processing', 'pending', 'requires_reconciliation', 'succeeded', 'failed', 'cancelled'],
    processing: ['pending', 'requires_reconciliation', 'succeeded', 'failed', 'cancelled'],
    pending: ['processing', 'requires_reconciliation', 'succeeded', 'failed', 'cancelled'],
    requires_reconciliation: ['processing', 'pending', 'succeeded', 'failed', 'cancelled'],
    succeeded: [], failed: [], cancelled: [],
  },
  payout: { draft: ['pending', 'cancelled'], pending: ['paid', 'cancelled'], paid: [], cancelled: [] },
  earning: { pending: ['eligible', 'reversed'], eligible: ['included_in_payout', 'reversed'],
    included_in_payout: ['eligible', 'reversed'], reversed: [] },
};

export function assertFinancialTransition({ entity, from, to }) {
  const states = Object.hasOwn(transitions, entity) ? transitions[entity] : null;
  if (!states || !Object.hasOwn(states, from) || !Object.hasOwn(states, to)
      || (from !== to && !states[from].includes(to))) {
    throw new ApiError(409, 'FINANCIAL_STATE_CONFLICT', 'The financial state transition is not allowed');
  }
}

export function financialDeadlines(input) {
  const { paymentConfirmedAt, refundWindowSeconds } = deadlineInputSchema.parse(input);
  const deadline = new Date(paymentConfirmedAt.getTime() + refundWindowSeconds * 1000);
  if (!Number.isFinite(deadline.getTime())) throw new RangeError('Financial deadline is outside the date range');
  return { refundDeadlineAt: deadline, eligibleAt: new Date(deadline) };
}

// This is a plan, not a ledger mutation or provider-truth verification.
export function fullRefundLedgerAction({ saleStatus, payoutStatus = null }) {
  if (saleStatus === 'reversed' && payoutStatus === null) return 'already_reversed';
  if (['pending', 'eligible'].includes(saleStatus) && payoutStatus === null) return 'reverse_sale';
  if (saleStatus === 'included_in_payout') {
    if (payoutStatus === 'draft') return 'cancel_draft_and_reverse_sale';
    if (payoutStatus === 'pending') return 'defer_adjustment_until_transfer_resolution';
    if (payoutStatus === 'paid') return 'create_eligible_adjustment';
  }
  throw new ApiError(409, 'FINANCIAL_STATE_CONFLICT', 'The earning and payout states require reconciliation');
}
