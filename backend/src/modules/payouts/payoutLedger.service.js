import { EarningEntry } from '../../models/EarningEntry.js';
import { FinancialHold } from '../../models/FinancialHold.js';
import { PayoutItem } from '../../models/PayoutItem.js';
import { Refund } from '../../models/Refund.js';
import { ApiError } from '../../utils/ApiError.js';
import { sumMinorUnits } from '../../utils/money.js';

export const payoutItemLimit = 1000;
export const payoutConflict = () => new ApiError(409, 'PAYOUT_STATE_CONFLICT', 'The payout state requires review');
export const payoutClaim = payout => ({ payoutId: payout.id, instructorId: payout.instructorId,
  currency: payout.currency, status: 'included_in_payout' });
const by = (rows, key) => new Map(rows.map(row => [String(row[key]), row]));
const same = (left, right) => left != null && right != null && String(left) === String(right);

export async function readReservedLedger(payout, session) {
  const items = await PayoutItem.find({ payoutId: payout.id }).limit(payoutItemLimit + 1).session(session).lean().maxTimeMS(5000);
  const entries = await EarningEntry.find({ payoutId: payout.id }).limit(payoutItemLimit + 1).session(session).lean().maxTimeMS(5000);
  if (!items.length || items.length > payoutItemLimit || items.length !== payout.lineCount || entries.length !== items.length) {
    throw payoutConflict();
  }
  const entriesById = by(entries, '_id');
  for (const item of items) {
    const entry = entriesById.get(String(item.earningEntryId));
    if (entry?.status !== 'included_in_payout' || !same(entry.instructorId, payout.instructorId)
        || !same(item.instructorId, payout.instructorId) || item.currency !== payout.currency || entry.currency !== item.currency
        || entry.type !== item.type || entry.amountMinor !== item.amountMinor || !Number.isSafeInteger(item.amountMinor)
        || (item.type === 'sale' ? item.amountMinor < 0 : item.type !== 'refund_adjustment' || item.amountMinor >= 0)) throw payoutConflict();
  }
  try {
    if (payout.amountMinor <= 0 || sumMinorUnits(items.map(item => item.amountMinor)) !== payout.amountMinor) throw payoutConflict();
  } catch (error) {
    if (error instanceof RangeError) throw payoutConflict();
    throw error;
  }
  return entries;
}

const dependencySource = refund => `refund:${refund._id}`;

// Match each successful refund against its reserved sale and its exact adjustment/hold.
// Finalizing an existing transfer can never clear unrelated financial holds.
async function readRefundDependencies(payout, entries, { session, now }) {
  const sales = by(entries.filter(entry => entry.type === 'sale'), 'orderId');
  const refunds = await Refund.find({ orderId: { $in: [...sales.keys()] }, status: 'succeeded' })
    .select('+providerRefundId').limit(sales.size + 1).session(session).lean().maxTimeMS(5000);
  const dependencies = await EarningEntry.find({ dependentOnPayoutId: payout.id })
    .limit(sales.size + 1).session(session).lean().maxTimeMS(5000);
  const holds = await FinancialHold.find({ instructorId: payout.instructorId, sourceType: 'payout',
    sourceId: { $in: refunds.map(dependencySource) } }).session(session).lean().maxTimeMS(5000);
  const adjustmentByRefund = by(dependencies, 'refundId');
  const holdBySource = by(holds, 'sourceId');
  const seenOrders = new Set();
  const effects = refunds.map(refund => {
    const orderId = String(refund.orderId);
    const sale = sales.get(orderId);
    if (seenOrders.has(orderId) || !sale || refund.kind !== 'full' || !refund.providerRefundId
        || !same(refund.instructorId, payout.instructorId) || refund.currency !== payout.currency
        || refund.amountMinor !== refund.paymentAmountMinor || !(refund.completedAt instanceof Date) || refund.completedAt > now) {
      throw payoutConflict();
    }
    seenOrders.add(orderId);
    if (sale.amountMinor === 0) return { sale };
    const adjustment = adjustmentByRefund.get(String(refund._id));
    const hold = holdBySource.get(dependencySource(refund));
    if (!adjustment || adjustment.status !== 'pending' || adjustment.payoutId || adjustment.eligibleAt
        || !same(adjustment.orderId, sale.orderId) || !same(adjustment.instructorId, payout.instructorId)
        || !same(adjustment.policyVersionId, sale.policyVersionId) || adjustment.currency !== payout.currency
        || adjustment.type !== 'refund_adjustment' || adjustment.amountMinor !== -sale.amountMinor
        || !hold || hold.resolvedAt || hold.reasonCode !== 'REFUND_DEPENDENT_TRANSFER' || !same(hold.paymentId, refund.paymentId)) {
      throw payoutConflict();
    }
    adjustmentByRefund.delete(String(refund._id));
    return { sale, adjustment, hold };
  });
  if (adjustmentByRefund.size || dependencies.length !== effects.filter(effect => effect.adjustment).length) throw payoutConflict();
  return effects;
}

export async function settleReservedLedger({ payout, entries, context, finance, actorId, paid }) {
  const { session, now } = context;
  const effects = payout.status === 'pending' ? await readRefundDependencies(payout, entries, context) : [];
  const adjustments = effects.filter(effect => effect.adjustment);
  if (adjustments.length) {
    const result = await EarningEntry.updateMany({ _id: { $in: adjustments.map(effect => effect.adjustment._id) }, dependentOnPayoutId: payout.id,
      status: 'pending', eligibleAt: null, payoutId: null }, { $set: paid
      ? { status: 'eligible', eligibleAt: now } : { status: 'reversed' } }, { session, maxTimeMS: 5000 });
    if (result.modifiedCount !== adjustments.length) throw payoutConflict();
    await finance.resolveOpenHolds(context, { holdIds: adjustments.map(effect => String(effect.hold._id)), resolvedBy: actorId,
      resolutionCode: paid ? 'DEPENDENT_TRANSFER_PAID' : 'DEPENDENT_TRANSFER_NOT_SENT' });
  }
  if (paid) return;
  const reversedIds = effects.map(effect => effect.sale._id);
  if (reversedIds.length) {
    const reversed = await EarningEntry.updateMany({ ...payoutClaim(payout), _id: { $in: reversedIds } },
      { $set: { payoutId: null, status: 'reversed' } }, { session, maxTimeMS: 5000 });
    if (reversed.modifiedCount !== reversedIds.length) throw payoutConflict();
  }
  const released = await EarningEntry.updateMany(payoutClaim(payout),
    { $set: { payoutId: null, status: 'eligible' } }, { session, maxTimeMS: 5000 });
  if (released.modifiedCount !== entries.length - reversedIds.length) throw payoutConflict();
}
