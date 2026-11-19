import mongoose from 'mongoose';

import { EarningEntry } from '../../models/EarningEntry.js';
import { Order } from '../../models/Order.js';
import { Payout } from '../../models/Payout.js';
import { PayoutItem } from '../../models/PayoutItem.js';
import { Refund } from '../../models/Refund.js';
import { ApiError } from '../../utils/ApiError.js';
import { createKeysetCursor } from '../../utils/keysetCursor.js';
import { sumMinorUnits } from '../../utils/money.js';
import { toPayoutItem } from '../payouts/payout.presenter.js';
import { payoutItemLimit } from '../payouts/payoutLedger.service.js';
import { toInstructorEarning, toInstructorPayout, toInstructorSale } from './instructorFinance.presenter.js';
import { readInstructorSummary, reportConflict } from './instructorFinanceSummary.service.js';

const payoutFields = 'status currency amountMinor lineCount periodStart periodEnd cutoffAt createdAt paidAt cancelledAt transferMethod';
const saleFields = 'courseId courseTitleSnapshot status currency amountMinor platformAmountMinor instructorAmountMinor paidAt paymentConfirmedAt';
const earningFields = 'orderId type status amountMinor currency createdAt eligibleAt payoutId';
const byId = rows => new Map(rows.map(row => [String(row._id), row]));
const objectId = id => new mongoose.Types.ObjectId(id);
const ownerOf = (id, currency = 'EGP') => ({ instructorId: objectId(id), currency });
const dayMs = 86_400_000;

function timeWindow(query, asOf) {
  if (query.to > asOf) throw new ApiError(400, 'INVALID_FINANCIAL_RANGE', 'The range cannot end in the future');
  return query.from ? { $gte: query.from, $lt: query.to } : { $lte: asOf };
}

const cursorFor = kind => createKeysetCursor({ namespace: `instructor-finance:${kind}:v1`,
  normalizeFilters: ({ instructorId, currency, from, to, courseId, type, status }) =>
    [instructorId, currency, from ?? null, to ?? null, courseId ?? null, type ?? null, status ?? null],
});
const cursors = { sales: cursorFor('sales'), earnings: cursorFor('earnings'), payouts: cursorFor('payouts') };

async function listPage({ model, filter, sortField, fields, query, cursor, instructorId, session }) {
  const scope = { ...query, instructorId };
  const after = cursor.decode(query.cursor, scope);
  if (after) filter.$or = [{ [sortField]: { $lt: after.createdAt } },
    { [sortField]: after.createdAt, _id: { $lt: after.id } }];
  const rows = await model.find(filter).select(fields).sort({ [sortField]: -1, _id: -1 }).limit(query.limit + 1)
    .session(session).lean().maxTimeMS(5000);
  const page = rows.slice(0, query.limit);
  const hasMore = rows.length > query.limit;
  const last = page.at(-1);
  return { page, pagination: { hasMore,
    nextCursor: hasMore ? cursor.encode({ _id: last._id, createdAt: last[sortField] }, scope) : null } };
}

async function readSaleRefunds(page, owner, session) {
  if (!page.length) return new Map();
  const refundRows = await Refund.find({ ...owner, orderId: { $in: page.map(row => row._id) }, kind: 'full', status: 'succeeded' })
    .select('orderId amountMinor completedAt').limit(page.length + 1).session(session).lean().maxTimeMS(5000);
  const sales = byId(page);
  const refunds = new Map();
  for (const refund of refundRows) {
    const id = String(refund.orderId);
    const sale = sales.get(id);
    if (refunds.has(id) || sale?.status !== 'refunded' || sale.amountMinor !== refund.amountMinor || !refund.completedAt) {
      throw reportConflict();
    }
    refunds.set(id, refund);
  }
  return refunds;
}

async function readPayoutItems(payout, owner, session) {
  const items = await PayoutItem.find({ ...owner, payoutId: payout._id })
    .select('earningEntryId amountMinor currency type').sort({ earningEntryId: 1 })
    .limit(payoutItemLimit + 1).session(session).lean().maxTimeMS(5000);
  if (items.length === 0 || items.length !== payout.lineCount || items.length > payoutItemLimit) throw reportConflict();
  try {
    if (sumMinorUnits(items.map(item => item.amountMinor)) !== payout.amountMinor) throw reportConflict();
  } catch (error) {
    if (error instanceof RangeError || error instanceof TypeError) throw reportConflict();
    throw error;
  }
  return items.map(toPayoutItem);
}

export function createInstructorFinanceService({ clock = () => new Date() } = {}) {
  const read = work => mongoose.connection.transaction(session => work(session, clock()),
    { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 5000 });

  return Object.freeze({
    summary({ instructorId, query }) {
      return read(async (session, asOf) => {
        timeWindow(query, asOf);
        const range = { from: query.from ?? new Date(asOf.getTime() - 30 * dayMs), to: query.to ?? asOf };
        const summary = await readInstructorSummary({ owner: ownerOf(instructorId, query.currency), range, asOf, session });
        return { summary };
      });
    },
    sales({ instructorId, query }) {
      return read(async (session, asOf) => {
        const owner = ownerOf(instructorId, query.currency);
        const filter = { ...owner, status: query.status ?? { $in: ['paid', 'refunded'] }, paidAt: timeWindow(query, asOf),
          ...(query.courseId && { courseId: objectId(query.courseId) }) };
        const { page, pagination } = await listPage({ model: Order, filter, sortField: 'paidAt', fields: saleFields,
          query, cursor: cursors.sales, instructorId, session });
        const refunds = await readSaleRefunds(page, owner, session);
        return { asOf, sales: page.map(row => toInstructorSale(row, refunds.get(String(row._id)))), pagination };
      });
    },
    earnings({ instructorId, query }) {
      return read(async (session, asOf) => {
        const owner = ownerOf(instructorId, query.currency);
        const filter = { ...owner, createdAt: timeWindow(query, asOf),
          ...(query.status && { status: query.status }), ...(query.type && { type: query.type }) };
        const { page, pagination } = await listPage({ model: EarningEntry, filter, sortField: 'createdAt', fields: earningFields,
          query, cursor: cursors.earnings, instructorId, session });
        const payoutIds = page.map(row => row.payoutId).filter(Boolean);
        const payouts = payoutIds.length ? byId(await Payout.find({ ...owner, _id: { $in: payoutIds } })
          .select('status').session(session).lean().maxTimeMS(5000)) : new Map();
        const earnings = page.map(row => {
          const payout = row.payoutId && payouts.get(String(row.payoutId));
          if (Boolean(row.payoutId) !== Boolean(payout) || (row.status === 'included_in_payout') !== Boolean(payout)
              || payout?.status === 'cancelled') throw reportConflict();
          return toInstructorEarning(row, payout);
        });
        return { asOf, earnings, pagination };
      });
    },
    payouts({ instructorId, query }) {
      return read(async (session, asOf) => {
        const filter = { ...ownerOf(instructorId, query.currency), createdAt: timeWindow(query, asOf),
          ...(query.status && { status: query.status }) };
        const { page, pagination } = await listPage({ model: Payout, filter, sortField: 'createdAt', fields: payoutFields,
          query, cursor: cursors.payouts, instructorId, session });
        return { asOf, payouts: page.map(toInstructorPayout), pagination };
      });
    },
    payout({ instructorId, payoutId }) {
      return read(async (session, asOf) => {
        const owner = ownerOf(instructorId);
        const payout = await Payout.findOne({ ...owner, _id: payoutId }).select(payoutFields).session(session).lean().maxTimeMS(5000);
        if (!payout) throw new ApiError(404, 'PAYOUT_NOT_FOUND', 'Payout was not found');
        return { asOf, payout: toInstructorPayout(payout), items: await readPayoutItems(payout, owner, session) };
      });
    },
  });
}
