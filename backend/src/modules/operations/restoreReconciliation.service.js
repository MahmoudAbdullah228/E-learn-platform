import mongoose from 'mongoose';

import { pageOptions } from './operations.schemas.js';

export async function reconcileRestoredPayments({ database, provider, options }) {
  if (!/^[a-z0-9_]+_restore$/.test(database.databaseName)) throw new Error('An isolated restore database is required');
  const { after, limit } = pageOptions.parse(options);
  const filter = after ? { _id: { $gt: new mongoose.Types.ObjectId(after) } } : {};
  const rows = await database.collection('payments').find(filter).sort({ _id: 1 }).limit(limit + 1).toArray();
  const report = { checked: 0, matched: 0, review: 0, nextAfter: null,
    payoutsToCompare: await database.collection('payouts').countDocuments({}), externalPeriodReviewRequired: true };
  for (const payment of rows.slice(0, limit)) {
    report.checked++;
    if (!payment.checkoutSessionId || !['succeeded', 'refunded'].includes(payment.status)) { report.review++; continue; }
    const checkout = await provider.retrieveCheckoutSession(payment.checkoutSessionId);
    const order = await database.collection('orders').findOne({ _id: payment.orderId });
    const intent = checkout.paymentIntent;
    if (!order || checkout.status !== 'complete' || intent?.livemode !== false || intent.status !== 'succeeded'
        || !Number.isSafeInteger(payment.amountMinor) || payment.amountMinor <= 0
        || intent.id !== payment.paymentIntentId || intent.orderId !== String(order._id)
        || intent.currency !== payment.currency || intent.amountMinor !== payment.amountMinor
        || intent.amountReceivedMinor !== payment.amountMinor || checkout.id !== payment.checkoutSessionId || checkout.paymentStatus !== 'paid'
        || checkout.paymentIntentId !== payment.paymentIntentId || checkout.orderId !== String(order._id)
        || checkout.metadataOrderId !== String(order._id) || checkout.currency !== payment.currency
        || checkout.amountMinor !== payment.amountMinor || order.amountMinor !== payment.amountMinor
        || order.currency !== payment.currency || order.status !== (payment.status === 'refunded' ? 'refunded' : 'paid')) {
      report.review++; continue;
    }
    const observations = await provider.scanRefundObservations({ paymentIntentId: payment.paymentIntentId });
    const refunds = await database.collection('refunds').find({ paymentId: payment._id }).toArray();
    const matches = refunds.length === observations.length && observations.every(item => refunds.some(local =>
      String(local.orderId) === String(order._id) && String(local.instructorId) === String(order.instructorId)
      && local.providerRefundId === item.providerRefundId && local.status === 'succeeded' && item.providerStatus === 'succeeded'
      && local.amountMinor === item.amountMinor && local.currency === payment.currency
      && item.currency.toUpperCase() === payment.currency && item.paymentIntentId === payment.paymentIntentId));
    const refunded = observations.reduce((sum, item) => sum + item.amountMinor, 0);
    if (matches && refunded === (payment.status === 'refunded' ? payment.amountMinor : 0)) report.matched++;
    else report.review++;
  }
  if (rows.length > limit) report.nextAfter = String(rows[limit - 1]._id);
  return report;
}
