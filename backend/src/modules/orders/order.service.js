import mongoose from 'mongoose';

import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { ApiError } from '../../utils/ApiError.js';
import { toPagination } from '../../utils/pagination.js';
import { toOrder, toPayment } from './order.presenter.js';

const snapshot = work => mongoose.connection.transaction(work,
  { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });

export function createOrderService() {
  async function list(filter, query, admin) {
    return snapshot(async session => {
      const orders = await Order.find(filter).sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit).limit(query.limit).session(session).lean();
      const total = await Order.countDocuments(filter).session(session);
      return { orders: orders.map(order => toOrder(order, { admin })), pagination: toPagination(query, total) };
    });
  }
  async function get(filter, admin) {
    return snapshot(async session => {
      const order = await Order.findOne(filter).session(session).lean();
      if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Order was not found');
      const payment = await Payment.findOne({ orderId: order._id })
        .select('_id provider status amountMinor currency paidAt').session(session).lean();
      return { order: toOrder(order, { admin }), payment: toPayment(payment) };
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
