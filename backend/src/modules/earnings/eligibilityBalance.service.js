import mongoose from 'mongoose';
import { z } from 'zod';

import { EarningEntry } from '../../models/EarningEntry.js';
import { FinancialHold } from '../../models/FinancialHold.js';
import { FinancialPolicyVersion } from '../../models/FinancialPolicyVersion.js';
import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { Payout } from '../../models/Payout.js';
import { PayoutItem } from '../../models/PayoutItem.js';
import { Refund } from '../../models/Refund.js';
import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { sumMinorUnits } from '../../utils/money.js';
import { eligibilitySummarySchema } from './earnings.schemas.js';
import { evaluateSaleEligibility } from './eligibility.policy.js';
import { hasUnresolvedFinancialEvent } from './eligibilityEvidence.service.js';

const byId = rows => new Map(rows.map(row => [String(row._id), row]));
const validDate = value => value instanceof Date && Number.isFinite(value.getTime());
const same = (left, right) => left != null && right != null && String(left) === String(right);
const capacityError = () => new ApiError(409, 'EARNINGS_CAPACITY_EXCEEDED', 'The complete earnings set requires a reviewed batch strategy');
function total(amounts) {
  if (!amounts.every(Number.isSafeInteger)) {
    throw new ApiError(409, 'EARNINGS_EVIDENCE_REQUIRES_REVIEW', 'The earnings amounts require review');
  }
  try { return sumMinorUnits(amounts); }
  catch (error) {
    if (error instanceof RangeError) throw capacityError();
    throw error;
  }
}

// Internal snapshot preview, never a reservation/transfer authorization. In particular,
// a historical positive cutoff cannot hide a debt already known at the decision time.
export function createEligibilityBalanceService({ clock = () => new Date(), capacity = 1000 } = {}) {
  capacity = z.number().int().min(1).max(1000).parse(capacity);
  async function read(input, { session, now }) {
    if (!session?.inTransaction()) throw new TypeError('Earnings balance requires a transaction');
    const { instructorId, currency, cutoffAt = now } = eligibilitySummarySchema.parse(input);
    if (!validDate(now) || cutoffAt > now) throw new ApiError(400, 'INVALID_FINANCIAL_CUTOFF', 'Cutoff must not be in the future');
    if (!await User.exists({ _id: instructorId }).session(session)) {
      throw new ApiError(404, 'FINANCIAL_ACCOUNT_NOT_FOUND', 'The financial account was not found');
    }
    const entries = await EarningEntry.find({ instructorId, currency, status: 'eligible', payoutId: null })
      .sort({ createdAt: 1, _id: 1 }).limit(capacity + 1).session(session).maxTimeMS(5000).lean();
    if (entries.length > capacity) throw capacityError();
    const deferred = await EarningEntry.find({ instructorId, currency, type: 'refund_adjustment', status: 'pending' })
      .sort({ createdAt: 1, _id: 1 }).limit(capacity - entries.length + 1).session(session).maxTimeMS(5000).lean();
    if (entries.length + deferred.length > capacity) throw capacityError();
    const orders = await Order.find({ _id: { $in: entries.map(entry => entry.orderId) } }).session(session).maxTimeMS(5000).lean();
    const payments = await Payment.find({ orderId: { $in: orders.map(order => order._id) } })
      .select('+paymentIntentId').session(session).maxTimeMS(5000).lean();
    const policies = await FinancialPolicyVersion.find({ _id: { $in: entries.map(entry => entry.policyVersionId).filter(Boolean) } })
      .session(session).maxTimeMS(5000).lean();
    const refunds = await Refund.find({ _id: { $in: entries.map(entry => entry.refundId).filter(Boolean) } })
      .select('+providerRefundId').session(session).maxTimeMS(5000).lean();
    const sales = await EarningEntry.find({ orderId: { $in: entries.filter(entry => entry.type === 'refund_adjustment').map(entry => entry.orderId) }, type: 'sale' })
      .session(session).maxTimeMS(5000).lean();
    const payouts = await Payout.find({ _id: { $in: sales.map(sale => sale.payoutId).filter(Boolean) } })
      .session(session).maxTimeMS(5000).lean();
    const itemKeys = sales.filter(sale => sale.payoutId)
      .map(sale => ({ payoutId: sale.payoutId, earningEntryId: sale._id }));
    const paidItems = itemKeys.length
      ? await PayoutItem.find({ $or: itemKeys }).session(session).maxTimeMS(5000).lean() : [];
    const itemBySale = new Map(paidItems.map(item => [String(item.earningEntryId), item]));
    const orderById = byId(orders); const policyById = byId(policies); const refundById = byId(refunds); const payoutById = byId(payouts);
    const paymentByOrder = new Map(payments.map(payment => [String(payment.orderId), payment]));
    const saleByOrder = new Map(sales.map(sale => [String(sale.orderId), sale]));
    const reasons = new Set(); const positive = []; const negative = []; const selected = [];
    for (const entry of entries) {
      const order = orderById.get(String(entry.orderId)); const payment = paymentByOrder.get(String(entry.orderId));
      if (entry.type === 'sale') {
        const decision = evaluateSaleEligibility({ entry, order, payment, policy: policyById.get(String(entry.policyVersionId)), now });
        if (!decision.eligible) reasons.add(decision.deadline ? 'EARNINGS_EVIDENCE_REQUIRES_REVIEW' : decision.code);
        if (!validDate(entry.eligibleAt)) reasons.add('EARNINGS_EVIDENCE_REQUIRES_REVIEW');
        if (!validDate(entry.eligibleAt) || entry.eligibleAt <= cutoffAt) {
          positive.push(entry.amountMinor);
          selected.push(entry);
        }
      } else {
        // Always carry known negative balances; questionable proof blocks release,
        // rather than dropping a debt and presenting an inflated transferable net.
        negative.push(entry.amountMinor);
        selected.push(entry);
        const refund = refundById.get(String(entry.refundId)); const sale = saleByOrder.get(String(entry.orderId));
        const payout = sale && payoutById.get(String(sale.payoutId));
        const item = sale && itemBySale.get(String(sale._id));
        if (entry.type !== 'refund_adjustment' || entry.amountMinor >= 0 || !validDate(entry.eligibleAt) || entry.eligibleAt > now
            || order?.status !== 'refunded' || payment?.status !== 'refunded'
            || payment.amountMinor !== order?.amountMinor || payment.currency !== currency || payment.provider !== 'stripe'
            || refund?.status !== 'succeeded' || refund.kind !== 'full' || !refund.providerRefundId || !validDate(refund.completedAt)
            || refund.completedAt > now || refund.paymentAmountMinor !== order?.amountMinor
            || !same(refund.paymentId, payment?._id) || !same(refund.orderId, order?._id)
            || !same(refund.instructorId, instructorId) || refund.amountMinor !== order?.amountMinor || refund.currency !== currency
            || !same(order?.instructorId, instructorId) || entry.amountMinor !== -order?.instructorAmountMinor
            || sale?.status !== 'included_in_payout' || sale.amountMinor !== order?.instructorAmountMinor
            || !same(sale.instructorId, instructorId) || sale.currency !== currency
            || item?.type !== 'sale' || item.amountMinor !== sale.amountMinor
            || item.currency !== currency || !same(item.instructorId, instructorId)
            || payout?.status !== 'paid' || payout.transferOutcome !== 'confirmed_paid' || !payout.paidAt || !payout.transferReference
            || !payout.paidBy || !payout.sealedAt || !payout.sealedBy || !payout.transferAttemptId || !payout.transferMethod
            || !same(payout.instructorId, instructorId) || payout.currency !== currency
            || (entry.dependentOnPayoutId && !same(entry.dependentOnPayoutId, payout?._id))) reasons.add('EARNINGS_EVIDENCE_REQUIRES_REVIEW');
      }
    }
    const held = Boolean(await FinancialHold.exists({ instructorId, resolvedAt: null }).session(session).maxTimeMS(5000));
    if (held) reasons.add('FINANCIAL_HOLD_ACTIVE');
    const saleOrderIds = new Set(entries.filter(entry => entry.type === 'sale').map(entry => String(entry.orderId)));
    if (await Refund.exists({ paymentId: { $in: payments.filter(payment => saleOrderIds.has(String(payment.orderId))).map(payment => payment._id) },
      status: { $nin: ['failed', 'cancelled'] } }).session(session).maxTimeMS(5000)) reasons.add('REFUND_UNRESOLVED');
    if (deferred.length) reasons.add('DEPENDENT_TRANSFER_UNRESOLVED');
    if (await Payout.exists({ instructorId, currency, status: { $in: ['draft', 'pending'] } }).session(session).maxTimeMS(5000)) reasons.add('PAYOUT_ACTIVE');
    if (await hasUnresolvedFinancialEvent({ paymentIntentIds: payments.map(payment => payment.paymentIntentId).filter(Boolean), session })) reasons.add('FINANCIAL_EVENT_PENDING');
    // No periodStart filter, no positive-only selection and no first-N truncated total.
    return { entries: selected, balance: { currency, asOf: now, cutoffAt, entryCount: entries.length,
      selectedEntryCount: selected.length,
      eligibleSaleMinor: total(positive), eligibleAdjustmentMinor: total(negative),
      netEligibleMinor: total([...positive, ...negative]),
      deferredAdjustmentMinor: total(deferred.map(entry => entry.amountMinor)),
      blocked: reasons.size > 0, reasonCodes: [...reasons].sort() } };
  }
  return Object.freeze({
    read,
    inspect(input) {
      return mongoose.connection.transaction(async session => {
        const { balance } = await read(input, { session, now: clock() });
        return balance;
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 10_000 });
    },
  });
}
