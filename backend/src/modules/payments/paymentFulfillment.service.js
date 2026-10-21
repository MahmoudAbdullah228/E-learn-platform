import mongoose from 'mongoose';

import { EarningEntry } from '../../models/EarningEntry.js';
import { Enrollment } from '../../models/Enrollment.js';
import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { WebhookEvent } from '../../models/WebhookEvent.js';
import { ApiError } from '../../utils/ApiError.js';

const transactionOptions = { readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' }, maxCommitTimeMS: 10_000 };
const fields = '+checkoutSessionId +paymentIntentId';

function mismatch() {
  return new ApiError(409, 'PAYMENT_EVIDENCE_MISMATCH', 'Payment evidence requires review');
}
function awaitingEvidence() {
  return new ApiError(503, 'PAYMENT_EVIDENCE_PENDING', 'Payment confirmation is not yet available');
}

function assertReferences(evidence, current, order, payment) {
  if (!order || !payment || payment.provider !== 'stripe'
      || evidence.orderId !== order.id || evidence.metadataOrderId !== order.id
      || current.orderId !== order.id || current.metadataOrderId !== order.id
      || current.id !== evidence.sessionId
      || evidence.amountMinor !== order.amountMinor || current.amountMinor !== order.amountMinor
      || payment.amountMinor !== order.amountMinor || payment.currency !== order.currency
      || evidence.currency !== order.currency || current.currency !== order.currency
      || evidence.expiresAtSeconds * 1000 !== order.expiresAt.getTime()
      || !(current.expiresAt instanceof Date) || current.expiresAt.getTime() !== order.expiresAt.getTime()
      || (payment.checkoutSessionId && payment.checkoutSessionId !== current.id)
      || (payment.paymentIntentId && payment.paymentIntentId !== current.paymentIntentId)
      || (evidence.paymentIntentId && evidence.paymentIntentId !== current.paymentIntentId)) {
    throw mismatch();
  }
}

function assertPaid(evidence, current, order) {
  const intent = current.paymentIntent;
  if (evidence.status !== 'complete' || evidence.paymentStatus !== 'paid'
      || !evidence.paymentIntentId) throw mismatch();
  if (current.status !== 'complete' || current.paymentStatus !== 'paid'
      || !intent || intent.status !== 'succeeded') throw awaitingEvidence();
  if (intent.id !== evidence.paymentIntentId || intent.livemode !== false
      || intent.amountMinor !== order.amountMinor || intent.amountReceivedMinor !== order.amountMinor
      || intent.currency !== order.currency || intent.orderId !== order.id) throw mismatch();
}

export function createPaymentFulfillmentService({ clock = () => new Date() } = {}) {
  return Object.freeze({
    async fulfill({ job, current, signal }) {
      const guard = () => signal?.throwIfAborted();
      guard();
      await mongoose.connection.transaction(async session => {
        guard();
        const now = clock();
        // Write the inbox record first: an expired/stolen lease cannot commit any financial effect.
        const event = await WebhookEvent.updateOne({ _id: job._id, status: 'processing',
          leaseId: job.leaseId, leaseUntil: { $gt: now } },
        { $set: { status: 'processed', processedAt: now, leaseId: null, leaseUntil: null,
          lastError: null } }, { session });
        guard();
        if (!event.modifiedCount) throw new ApiError(409, 'PAYMENT_EVENT_LEASE_LOST',
          'Payment event processing lease expired');
        const order = await Order.findById(job.payload.orderId).session(session);
        guard();
        const payment = order && await Payment.findOne({ orderId: order.id })
          .select(fields).session(session);
        guard();
        assertReferences(job.payload, current, order, payment);

        // Late failure/expiration events cannot regress a fulfilled or refunded purchase.
        if (['paid', 'refunded'].includes(order.status)) {
          if (!['succeeded', 'refunded'].includes(payment.status)) throw mismatch();
          return;
        }
        if (order.status === 'cancelled' && payment.status === 'failed'
            && ['checkout.session.expired', 'checkout.session.async_payment_failed'].includes(job.eventType)
            && current.status === 'expired' && current.paymentStatus === 'unpaid') return;
        if (order.status !== 'pending' || !order.purchaseSlotActive
            || !['created', 'processing'].includes(payment.status)) throw mismatch();

        if (['checkout.session.completed', 'checkout.session.async_payment_succeeded']
          .includes(job.eventType)) {
          if (job.payload.paymentStatus === 'unpaid' && job.eventType === 'checkout.session.completed') {
            // Delayed methods complete checkout before payment; wait for their success event.
            return;
          }
          assertPaid(job.payload, current, order);
          await Payment.updateOne({ _id: payment.id }, { $set: {
            status: 'succeeded', checkoutSessionId: current.id, paymentIntentId: current.paymentIntentId,
            paidAt: now, checkoutLeaseId: null, checkoutLeaseUntil: null,
          } }, { session });
          guard();
          await Order.updateOne({ _id: order.id }, { $set: { status: 'paid', paidAt: now } }, { session });
          guard();
          // Suspensions and unpublished courses affect access later, not receipt accounting.
          const existing = await Enrollment.findOne({ studentId: order.studentId,
            courseId: order.courseId }).session(session);
          guard();
          if (existing) {
            if (existing.sourceOrderId?.toString() !== order.id || existing.status !== 'active')
              throw mismatch();
          } else {
            await Enrollment.create([{ studentId: order.studentId, courseId: order.courseId,
              sourceOrderId: order.id, enrolledAt: now }], { session });
            guard();
          }
          await EarningEntry.create([{ instructorId: order.instructorId, orderId: order.id,
            type: 'sale', amountMinor: order.instructorAmountMinor, currency: order.currency,
            status: 'pending' }], { session });
          guard();
          return;
        }

        // Only terminal, fresh provider evidence releases the purchase slot. A local timeout
        // or a delayed failure event is never proof that a successful payment did not occur.
        if (current.status !== 'expired' || current.paymentStatus !== 'unpaid'
            || (current.paymentIntentId && current.paymentIntentStatus !== 'canceled')) {
          throw awaitingEvidence();
        }
        await Payment.updateOne({ _id: payment.id }, { $set: { status: 'failed',
          checkoutSessionId: current.id, checkoutLeaseId: null, checkoutLeaseUntil: null } }, { session });
        guard();
        await Order.updateOne({ _id: order.id },
          { $set: { status: 'cancelled', purchaseSlotActive: false } }, { session });
        guard();
      }, transactionOptions);
    },
  });
}
