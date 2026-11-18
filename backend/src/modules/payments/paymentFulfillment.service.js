import { EarningEntry } from '../../models/EarningEntry.js';
import { Enrollment } from '../../models/Enrollment.js';
import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { WebhookEvent } from '../../models/WebhookEvent.js';
import { ApiError } from '../../utils/ApiError.js';
import { FinancialHold } from '../../models/FinancialHold.js';
import { createFinanceFoundationService } from '../finance/finance.service.js';
import { financialDeadlines } from '../finance/finance.policy.js';
import { financialEventSource } from '../refunds/refundInbox.service.js';

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
  const finance = createFinanceFoundationService({ clock });
  return Object.freeze({
    async fulfill({ job, current, signal }) {
      const guard = () => signal?.throwIfAborted();
      guard();
      const hint = await Order.findById(job.payload.orderId).select('instructorId');
      if (!hint) throw mismatch();
      await finance.runForInstructor({ instructorId: String(hint.instructorId) }, async context => {
        const { session } = context;
        guard();
        const now = clock();
        async function finish() {
          guard();
          const result = await WebhookEvent.updateOne({ _id: job._id, status: 'processing', leaseId: job.leaseId,
            leaseUntil: { $gt: clock() } }, { $set: { status: 'processed', processedAt: clock(), leaseId: null,
            leaseUntil: null, lastError: null } }, { session });
          if (!result.modifiedCount) throw new ApiError(409, 'PAYMENT_EVENT_LEASE_LOST', 'Payment event processing lease expired');
          guard();
        }
        // Write the inbox record first: an expired/stolen lease cannot commit any financial effect.
        const event = await WebhookEvent.updateOne({ _id: job._id, status: 'processing',
          leaseId: job.leaseId, leaseUntil: { $gt: now }, $or: [{ processingRevision: { $lt: Number.MAX_SAFE_INTEGER } },
            { processingRevision: { $exists: false } }] },
        { $inc: { processingRevision: 1 } }, { session });
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
          await finish();
          return;
        }
        if (order.status === 'cancelled' && payment.status === 'failed'
            && ['checkout.session.expired', 'checkout.session.async_payment_failed'].includes(job.eventType)
            && current.status === 'expired' && current.paymentStatus === 'unpaid') { await finish(); return; }
        if (order.status !== 'pending' || !order.purchaseSlotActive
            || !['created', 'processing'].includes(payment.status)) throw mismatch();

        if (['checkout.session.completed', 'checkout.session.async_payment_succeeded']
          .includes(job.eventType)) {
          if (job.payload.paymentStatus === 'unpaid' && job.eventType === 'checkout.session.completed') {
            // Delayed methods complete checkout before payment; wait for their success event.
            await finish();
            return;
          }
          assertPaid(job.payload, current, order);
          const confirmed = new Date(job.payload.created * 1000);
          if (!Number.isFinite(confirmed.getTime()) || confirmed > now
              || confirmed.getTime() < Math.floor(order.createdAt.getTime() / 1000) * 1000
              || (order.paymentConfirmedAt && order.paymentConfirmedAt.getTime() !== confirmed.getTime())
              || (payment.paymentConfirmedAt && payment.paymentConfirmedAt.getTime() !== confirmed.getTime())) throw mismatch();
          const deadlines = order.policyVersionId ? financialDeadlines({ paymentConfirmedAt: confirmed,
            refundWindowSeconds: order.refundWindowSeconds }) : null;
          if (deadlines && order.refundDeadlineAt && order.refundDeadlineAt.getTime() !== deadlines.refundDeadlineAt.getTime()) throw mismatch();
          const paymentChanged = await Payment.updateOne({ _id: payment.id, status: payment.status, ...(payment.paymentConfirmedAt ? {} : { paymentConfirmedAt: null }) }, { $set: {
            status: 'succeeded', checkoutSessionId: current.id, paymentIntentId: current.paymentIntentId,
            paidAt: now, checkoutLeaseId: null, checkoutLeaseUntil: null,
            ...(payment.paymentConfirmedAt ? {} : { paymentConfirmedAt: confirmed }),
          } }, { session });
          guard();
          const orderChanged = await Order.updateOne({ _id: order.id, status: 'pending', ...(order.paymentConfirmedAt ? {} : { paymentConfirmedAt: null }),
            ...(deadlines && !order.refundDeadlineAt ? { refundDeadlineAt: null } : {}) },
          { $set: { status: 'paid', paidAt: now, ...(order.paymentConfirmedAt ? {} : { paymentConfirmedAt: confirmed }),
            ...(deadlines && !order.refundDeadlineAt ? { refundDeadlineAt: deadlines.refundDeadlineAt } : {}) } }, { session });
          guard();
          if (!paymentChanged.modifiedCount || !orderChanged.modifiedCount) throw mismatch();
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
            status: 'pending', policyVersionId: order.policyVersionId, eligibleAt: deadlines?.eligibleAt ?? null }], { session });
          // Bind a previously unassociated early financial event before any future eligibility decision.
          const earlyEvents = WebhookEvent.find({ paymentIntentId: current.paymentIntentId, _id: { $ne: job._id },
            status: { $in: ['pending', 'processing', 'failed'] } }).select('eventId').session(session).cursor();
          for await (const early of earlyEvents) {
            guard();
            const sourceId = financialEventSource(early.eventId);
            if (!await FinancialHold.exists({ instructorId: order.instructorId, sourceType: 'operations', sourceId }).session(session)) {
              await finance.openHold(context, { sourceType: 'operations', sourceId, paymentId: payment.id, reasonCode: 'FINANCIAL_EVENT_PENDING' });
            }
          }
          guard();
          await finish();
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
        await finish();
      });
    },
  });
}
