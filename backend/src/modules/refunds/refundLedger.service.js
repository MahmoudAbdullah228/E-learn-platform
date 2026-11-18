import { EarningEntry } from '../../models/EarningEntry.js';
import { InstructorFinanceState } from '../../models/InstructorFinanceState.js';
import { Payout } from '../../models/Payout.js';
import { PayoutItem } from '../../models/PayoutItem.js';
import { ApiError } from '../../utils/ApiError.js';
import { appendAuditEvent } from '../audit/audit.service.js';

const conflict = () => new ApiError(409, 'REFUND_LEDGER_REQUIRES_REVIEW', 'The refund ledger requires review');

export async function applyFullRefundLedger({ refund, order, context, finance }) {
  const { session, now, instructorId } = context;
  const sale = await EarningEntry.findOne({ orderId: order.id, type: 'sale' }).session(session);
  if (!sale || String(sale.instructorId) !== instructorId || sale.currency !== order.currency
      || sale.amountMinor !== order.instructorAmountMinor) throw conflict();
  if (sale.status === 'reversed') throw conflict(); // Duplicate success is filtered by the reducer, not here.
  if (['pending', 'eligible'].includes(sale.status)) {
    if (sale.payoutId) throw conflict();
    await EarningEntry.updateOne({ _id: sale.id, status: sale.status }, { $set: { status: 'reversed' } }, { session });
    return;
  }
  if (sale.status !== 'included_in_payout' || !sale.payoutId) throw conflict();
  const payout = await Payout.findById(sale.payoutId).session(session);
  const item = payout && await PayoutItem.findOne({ payoutId: payout.id, earningEntryId: sale.id }).session(session);
  if (!payout || String(payout.instructorId) !== instructorId || payout.currency !== order.currency
      || !item || item.amountMinor !== sale.amountMinor || item.currency !== sale.currency || item.type !== 'sale') throw conflict();
  if (!Number.isSafeInteger(payout.revision) || payout.revision >= Number.MAX_SAFE_INTEGER) throw conflict();
  if (payout.status === 'draft') {
    const lineCount = await PayoutItem.countDocuments({ payoutId: payout.id }).session(session);
    const claims = await EarningEntry.countDocuments({ payoutId: payout.id, status: 'included_in_payout',
      instructorId, currency: payout.currency }).session(session);
    if (lineCount !== payout.lineCount || claims !== lineCount || payout.sealedAt || payout.transferAttemptId
        || payout.transferOutcome !== 'not_started') throw conflict();
    const cancelled = await Payout.updateOne({ _id: payout.id, status: 'draft', cancelledAt: null,
      cancellationReason: null, cancellationSource: null, cancelledByRefundId: null }, { $set: {
      status: 'cancelled', transferOutcome: 'confirmed_not_sent', cancelledAt: now,
      cancellationReason: 'Draft cancelled after a confirmed full refund', cancellationSource: 'refund', cancelledByRefundId: refund.id,
    }, $inc: { revision: 1 } }, { session });
    if (!cancelled.modifiedCount) throw conflict();
    // Release every claim, never a truncated positive-only subset. Large transactions
    // fail atomically for operational recovery rather than partially releasing a payout.
    const released = await EarningEntry.updateMany({ payoutId: payout.id, status: 'included_in_payout', instructorId,
      currency: payout.currency }, { $set: { payoutId: null, status: 'eligible' } }, { session, maxTimeMS: 10_000 });
    if (released.modifiedCount !== lineCount) throw conflict();
    await EarningEntry.updateOne({ _id: sale.id, status: 'eligible', payoutId: null }, { $set: { status: 'reversed' } }, { session });
    await InstructorFinanceState.updateOne({ instructorId, activePayoutId: payout.id }, { $set: { activePayoutId: null } }, { session });
    await appendAuditEvent({ session, occurredAt: now, input: { actorType: 'system', action: 'payout.cancelled', targetType: 'payout',
      targetId: payout.id, fromStatus: 'draft', toStatus: 'cancelled', reason: 'Draft cancelled after a confirmed full refund' } });
    return;
  }
  if (payout.status === 'cancelled' && payout.transferOutcome === 'confirmed_not_sent') {
    await EarningEntry.updateOne({ _id: sale.id }, { $set: { status: 'reversed', payoutId: null } }, { session });
    return;
  }
  if (!['pending', 'paid'].includes(payout.status) || !payout.sealedAt || !payout.sealedBy
      || !payout.transferAttemptId || !payout.transferMethod
      || (payout.status === 'paid' && (payout.transferOutcome !== 'confirmed_paid' || !payout.paidAt || !payout.paidBy || !payout.transferReference))) throw conflict();
  if (sale.amountMinor === 0) return;
  if (await EarningEntry.exists({ refundId: refund.id }).session(session)) throw conflict();
  await EarningEntry.create([{ instructorId, orderId: order.id, refundId: refund.id, type: 'refund_adjustment',
    amountMinor: -sale.amountMinor, currency: sale.currency, policyVersionId: sale.policyVersionId,
    status: payout.status === 'paid' ? 'eligible' : 'pending', eligibleAt: payout.status === 'paid' ? now : null,
    dependentOnPayoutId: payout.status === 'pending' ? payout.id : null,
  }], { session });
  if (payout.status === 'pending') await finance.openHold(context, { sourceType: 'payout', sourceId: `refund:${refund.id}`,
    paymentId: String(refund.paymentId), reasonCode: 'REFUND_DEPENDENT_TRANSFER' });
}
