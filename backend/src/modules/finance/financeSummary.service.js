import { EarningEntry } from '../../models/EarningEntry.js';
import { FinancialHold } from '../../models/FinancialHold.js';
import { Order } from '../../models/Order.js';
import { Payout } from '../../models/Payout.js';
import { Refund } from '../../models/Refund.js';
import { ApiError } from '../../utils/ApiError.js';

export const reportConflict = () => new ApiError(409, 'FINANCE_REPORT_REQUIRES_REVIEW',
  'The financial report requires review');
const max = BigInt(Number.MAX_SAFE_INTEGER);
const paidStatuses = ['paid', 'refunded'];
const fullRefund = { kind: 'full', status: 'succeeded' };
const dayMs = 86_400_000;

function safeReportAmount(value) {
  if (value > max || value < -max) throw reportConflict();
  return Number(value);
}

export function reportDateFilter(query, asOf) {
  if (query.to > asOf) throw new ApiError(400, 'INVALID_FINANCIAL_RANGE', 'The range cannot end in the future');
  return query.from ? { $gte: query.from, $lt: query.to } : { $lte: asOf };
}

export function reportWindow(query, asOf) {
  reportDateFilter(query, asOf);
  return { from: query.from ?? new Date(asOf.getTime() - 30 * dayMs), to: query.to ?? asOf };
}

// Convert through Int64 to retain every minor unit of BSON doubles. Direct conversion
// from double to Decimal128 can round significant digits. Reject malformed money.
function exactDecimal(input) {
  return { $let: { vars: { integer: { $convert: { input, to: 'long', onError: null, onNull: null } } }, in: {
    $cond: [{ $and: [{ $ne: ['$$integer', null] }, { $eq: ['$$integer', input] },
      { $gte: ['$$integer', -Number.MAX_SAFE_INTEGER] }, { $lte: ['$$integer', Number.MAX_SAFE_INTEGER] }] },
    { $toDecimal: '$$integer' }, null],
  } } };
}

async function summarize(model, pipeline, fields, groupBy, session) {
  const money = Object.entries(fields).map(([key, expression]) => [key, exactDecimal(expression)]);
  const rows = await model.aggregate([...pipeline,
    { $project: { bucket: groupBy, ...Object.fromEntries(money) } },
    { $group: { _id: '$bucket', count: { $sum: 1 },
      invalid: { $max: { $or: money.map(([key]) => ({ $eq: [`$${key}`, null] })) } },
      ...Object.fromEntries(money.map(([key]) => [key, { $sum: `$${key}` }])) } },
  ]).session(session).option({ maxTimeMS: 5000, allowDiskUse: false });
  return new Map(rows.map(row => {
    if (row.invalid || !Number.isSafeInteger(row.count)) throw reportConflict();
    const amounts = money.map(([key]) => {
      const value = row[key].toString();
      if (!/^-?\d+$/.test(value)) throw reportConflict();
      return [key, BigInt(value)];
    });
    return [row._id, { count: row.count, ...Object.fromEntries(amounts) }];
  }));
}

const splitFields = { gross: '$amountMinor', commission: '$platformAmountMinor', instructor: '$instructorAmountMinor' };
const zero = { count: 0, gross: 0n, commission: 0n, instructor: 0n };
const validLedgerSign = { $or: [
  { $and: [{ $eq: ['$type', 'sale'] }, { $gte: ['$amountMinor', 0] }] },
  { $and: [{ $eq: ['$type', 'refund_adjustment'] }, { $lt: ['$amountMinor', 0] }] },
] };
const currentLedgerAmount = { $cond: [
  { $and: [{ $eq: [{ $ifNull: ['$payoutId', null] }, null] }, validLedgerSign] }, '$amountMinor', null,
] };

export async function readFinanceSummary({ currency, instructorId, range, asOf, session }) {
  const scope = instructorId ? { instructorId } : {};
  const owner = { ...scope, currency };
  const bounds = { $gte: range.from, $lt: range.to };
  const sales = (await summarize(Order, [{ $match: { ...owner, status: { $in: paidStatuses }, paidAt: bounds } }],
    splitFields, null, session)).get(null) ?? zero;
  const refunds = (await summarize(Refund, [
    { $match: { ...owner, ...fullRefund, completedAt: bounds } },
    { $lookup: { from: Order.collection.name, localField: 'orderId', foreignField: '_id',
      pipeline: [{ $match: { ...owner, status: 'refunded' } },
        { $project: { instructorId: 1, amountMinor: 1, platformAmountMinor: 1, instructorAmountMinor: 1 } }], as: 'sale' } },
    { $set: { sale: { $first: '$sale' } } },
    { $set: { gross: { $cond: [{ $and: [{ $eq: ['$amountMinor', '$sale.amountMinor'] },
      { $eq: ['$instructorId', '$sale.instructorId'] },
      { $eq: ['$amountMinor', '$paymentAmountMinor'] }] }, '$amountMinor', null] } } },
  ], { gross: '$gross', commission: '$sale.platformAmountMinor', instructor: '$sale.instructorAmountMinor' },
  null, session)).get(null) ?? zero;

  // Balances are current and may include activity before the selected reporting range.
  const balances = await summarize(EarningEntry, [{ $match: { ...owner,
    status: { $in: ['pending', 'eligible'] }, createdAt: { $lte: asOf } } }],
  { total: currentLedgerAmount }, { $concat: ['$status', ':', '$type'] }, session);
  const total = key => balances.get(key)?.total ?? 0n;
  const pendingSale = total('pending:sale');
  const pendingAdjustment = total('pending:refund_adjustment');
  const eligibleSale = total('eligible:sale');
  const carry = total('eligible:refund_adjustment');
  const reserved = (await summarize(Payout, [{ $match: { ...owner,
    status: { $in: ['draft', 'pending'] }, createdAt: { $lte: asOf } } }], { total: '$amountMinor' }, null, session)).get(null);
  const payouts = await summarize(Payout, [{ $match: { ...owner, status: 'paid', paidAt: bounds } }],
    { total: '$amountMinor', simulated: { $cond: [{ $eq: ['$transferMethod', 'test_simulation'] }, '$amountMinor', 0] } },
    null, session);
  const paid = payouts.get(null);
  const activeHoldCount = await FinancialHold.countDocuments({ ...scope,
    resolvedAt: null, openedAt: { $lte: asOf } }).session(session).maxTimeMS(5000);

  const amounts = {
    grossSalesMinor: sales.gross, successfulRefundsMinor: refunds.gross, netSalesMinor: sales.gross - refunds.gross,
    platformCommissionNetMinor: sales.commission - refunds.commission,
    instructorEarnedNetMinor: sales.instructor - refunds.instructor,
    pendingMinor: pendingSale + pendingAdjustment, pendingSalesMinor: pendingSale,
    pendingAdjustmentsMinor: pendingAdjustment, eligibleAvailableMinor: eligibleSale + carry,
    negativeCarryMinor: carry, reservedMinor: reserved?.total ?? 0n,
    paidPayoutsMinor: paid?.total ?? 0n, simulatedPaidPayoutsMinor: paid?.simulated ?? 0n,
  };
  return { currency: owner.currency, range, asOf, saleCount: sales.count, successfulRefundCount: refunds.count,
    paidPayoutCount: paid?.count ?? 0, activeHoldCount, hasActiveHolds: activeHoldCount > 0,
    ...Object.fromEntries(Object.entries(amounts).map(([key, value]) => [key, safeReportAmount(value)])) };
}
