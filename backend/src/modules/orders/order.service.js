import mongoose from 'mongoose';

import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { Refund } from '../../models/Refund.js';
import { ApiError } from '../../utils/ApiError.js';
import { toPagination } from '../../utils/pagination.js';
import { toOrder, toPayment } from './order.presenter.js';

const snapshot = work => mongoose.connection.transaction(work,
  { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });

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
  async function get(filter, admin) {
    return snapshot(async session => {
      const order = await Order.findOne(filter).session(session).lean();
      if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Order was not found');
      const payment = await Payment.findOne({ orderId: order._id })
        .select('_id provider status amountMinor currency paidAt').session(session).lean();
      const refunds = await latestRefunds([order], session);
      return { order: toOrder(order, { admin, latestRefund: refunds.get(String(order._id)) }), payment: toPayment(payment) };
    });
  }
  return Object.freeze({
    listMine: ({ studentId, ...query }) => list({ studentId,
      ...(query.status ? { status: query.status } : {}) }, query, false),
    getMine: ({ studentId, orderId }) => get({ _id: orderId, studentId }, false),
    listAdmin: query => list({ ...(query.status ? { status: query.status } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.courseId ? { courseId: query.courseId } : {}) }, query, true),
    getAdmin: orderId => get({ _id: orderId }, true),
  });
}
