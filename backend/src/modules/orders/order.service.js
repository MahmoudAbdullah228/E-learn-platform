import mongoose from 'mongoose';

import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { Refund } from '../../models/Refund.js';
import { ApiError } from '../../utils/ApiError.js';
import { createKeysetCursor } from '../../utils/keysetCursor.js';
import { toPagination } from '../../utils/pagination.js';
import { toAdminOrderPayment, toAdminOrderRefund, toOrder, toPayment } from './order.presenter.js';

const snapshot = work => mongoose.connection.transaction(work,
  { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
const refundSort = { createdAt: -1, _id: -1 };
const refundFields = 'kind status amountMinor currency createdAt completedAt';
const paymentFields = 'provider status amountMinor currency paidAt';
const refundCursor = createKeysetCursor({ namespace: 'admin-order-refunds:v1',
  normalizeFilters: ({ orderId, adminId }) => [orderId, adminId] });

async function adminRefundHistory(order, { adminId, refundLimit, refundCursor: suppliedCursor }, session) {
  const scope = { orderId: String(order._id), adminId };
  const after = refundCursor.decode(suppliedCursor, scope);
  const filter = { orderId: order._id };
  if (after) filter.$or = [{ createdAt: { $lt: after.createdAt } }, { createdAt: after.createdAt, _id: { $lt: after.id } }];
  const rows = await Refund.find(filter).select(refundFields).select('+providerRefundId').sort(refundSort)
    .limit(refundLimit + 1).session(session).lean().maxTimeMS(5000);
  const items = rows.slice(0, refundLimit);
  const hasMore = rows.length > refundLimit;
  return { refunds: items.map(toAdminOrderRefund), refundPagination: {
    hasMore, nextCursor: hasMore ? refundCursor.encode(items.at(-1), scope) : null,
  } };
}

export function createOrderService() {
  async function latestRefunds(orders, session) {
    if (!orders.length) return new Map();
    const rows = await Refund.aggregate([
      { $match: { orderId: { $in: orders.map(order => order._id) } } },
      { $sort: { orderId: 1, createdAt: -1, _id: -1 } },
      { $group: { _id: '$orderId', refund: { $first: { _id: '$_id', kind: '$kind', status: '$status',
        amountMinor: '$amountMinor', currency: '$currency', createdAt: '$createdAt', completedAt: '$completedAt' } } } },
    ]).session(session).option({ maxTimeMS: 5000, allowDiskUse: false });
    return new Map(rows.map(row => [String(row._id), row.refund]));
  }
  async function list(filter, query, admin) {
    return snapshot(async session => {
      const orders = await Order.find(filter).sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit).limit(query.limit).session(session).lean();
      const total = await Order.countDocuments(filter).session(session);
      const refunds = await latestRefunds(orders, session);
      return { orders: orders.map(order => toOrder(order, { admin, latestRefund: refunds.get(String(order._id)) })), pagination: toPagination(query, total) };
    });
  }
  async function get(filter, adminQuery) {
    return snapshot(async session => {
      const order = await Order.findOne(filter).session(session).lean().maxTimeMS(5000);
      if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Order was not found');
      const paymentQuery = Payment.findOne({ orderId: order._id }).select(paymentFields);
      if (adminQuery) paymentQuery.select('paymentConfirmedAt +checkoutSessionId +paymentIntentId');
      const payment = await paymentQuery.session(session).lean().maxTimeMS(5000);
      const latestRefund = await Refund.findOne({ orderId: order._id }).select(refundFields).sort(refundSort)
        .session(session).lean().maxTimeMS(5000);
      const dto = toOrder(order, { admin: Boolean(adminQuery), latestRefund });
      if (!adminQuery) return { order: dto, payment: toPayment(payment) };
      const history = await adminRefundHistory(order, adminQuery, session);
      return { order: dto, payment: toAdminOrderPayment(payment), ...history };
    });
  }
  return Object.freeze({
    listMine: ({ studentId, ...query }) => list({ studentId,
      ...(query.status ? { status: query.status } : {}) }, query, false),
    getMine: ({ studentId, orderId }) => get({ _id: orderId, studentId }),
    listAdmin: query => list({ ...(query.status ? { status: query.status } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.courseId ? { courseId: query.courseId } : {}) }, query, true),
    getAdmin: ({ orderId, ...query }) => get({ _id: orderId }, query),
  });
}
