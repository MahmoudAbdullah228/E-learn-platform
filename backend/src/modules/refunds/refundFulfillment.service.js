import { Enrollment } from '../../models/Enrollment.js';
import { FinancialHold } from '../../models/FinancialHold.js';
import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { Refund } from '../../models/Refund.js';
import { WebhookEvent } from '../../models/WebhookEvent.js';
import { ApiError } from '../../utils/ApiError.js';
import { sumMinorUnits } from '../../utils/money.js';
import { appendAuditEvent } from '../audit/audit.service.js';
import { createFinanceFoundationService } from '../finance/finance.service.js';
import { refundObservationSchema, safetyObservationSchema } from './refundEvent.schemas.js';
import { financialEventSource, refundObservationEvent } from './refundInbox.service.js';
import { applyFullRefundLedger } from './refundLedger.service.js';

const mismatch = () => new ApiError(409, 'REFUND_EVIDENCE_MISMATCH', 'Refund evidence requires reconciliation');
const pending = () => new ApiError(503, 'REFUND_ASSOCIATION_PENDING', 'The original payment must be reconciled first');
const leaseLost = () => new ApiError(409, 'PAYMENT_EVENT_LEASE_LOST', 'Payment event processing lease expired');
const privateRefundFields = '+providerRefundId +providerCreatedAt +providerStatus +paymentIntentId';

export function createRefundFulfillmentService({ clock = () => new Date() } = {}) {
  const finance = createFinanceFoundationService({ clock });
  async function resolve(context, filter, code) {
    const holds = await FinancialHold.find({ instructorId: context.instructorId, resolvedAt: null, ...filter })
      .select('_id').session(context.session);
    for (const hold of holds) await finance.resolveHold(context, { holdId: hold.id, resolutionCode: code });
  }
  async function hold(context, payment, sourceId, reasonCode, sourceType = 'operations') {
    const existing = await FinancialHold.findOne({ instructorId: context.instructorId, sourceType, sourceId }).session(context.session);
    if (existing?.resolvedAt) {
      // A contradictory later observation gets a distinct incident, never reopens history.
      sourceId = `${sourceId}:r${context.revision}`;
    }
    await finance.openHold(context, { sourceType, sourceId, paymentId: payment.id, reasonCode });
  }
  async function updateRefund(row, set, context) {
    const filter = { _id: row.id, status: row.status, revision: row.revision };
    for (const field of ['providerRefundId', 'providerCreatedAt', 'completedAt']) {
      if (set[field] != null) {
        if (row[field] == null) filter[field] = null;
        else delete set[field];
      }
    }
    if (!Number.isSafeInteger(row.revision) || row.revision >= Number.MAX_SAFE_INTEGER) throw mismatch();
    const changed = await Refund.updateOne(filter, { $set: set, $inc: { revision: 1 } }, { session: context.session });
    if (!changed.modifiedCount) throw mismatch();
  }
  async function audit(row, action, fromStatus, toStatus, context) {
    await appendAuditEvent({ session: context.session, occurredAt: context.now, input: { actorType: 'system',
      action, targetType: 'refund', targetId: row.id, fromStatus, toStatus } });
  }
  async function reduceRefund({ current, order, payment, context }) {
    const { session, now } = context;
    if (current.amountMinor > order.amountMinor || current.currency !== order.currency || current.metadataConflict
        || current.providerCreatedAt > now || (current.correlation
          && (current.correlation.orderId !== order.id || current.correlation.paymentId !== payment.id))) {
      await hold(context, payment, `evidence:${current.providerRefundId}`, 'REFUND_EVIDENCE_REQUIRES_REVIEW');
      return 'REFUND_REQUIRES_REVIEW';
    }
    let row = await Refund.findOne({ provider: 'stripe', providerRefundId: current.providerRefundId })
      .select(privateRefundFields).session(session);
    if (!row && current.correlation) {
      row = await Refund.findById(current.correlation.refundId).select(privateRefundFields).session(session);
      if (!row || row.source !== 'admin') throw mismatch();
    }
    if (!row && current.amountMinor === order.amountMinor) {
      row = await Refund.findOne({ paymentId: payment.id, kind: 'full',
        status: { $in: ['requested', 'processing', 'pending', 'requires_reconciliation', 'succeeded'] } })
        .select(privateRefundFields).session(session);
    }
    if (row && (String(row.paymentId) !== payment.id || String(row.orderId) !== order.id
        || row.amountMinor !== current.amountMinor || row.currency !== current.currency
        || (row.providerRefundId && row.providerRefundId !== current.providerRefundId)
        || (row.providerCreatedAt && row.providerCreatedAt.getTime() !== current.providerCreatedAt.getTime()))) {
      await hold(context, payment, `identity:${current.providerRefundId}`, 'REFUND_IDENTITY_REQUIRES_REVIEW');
      return 'REFUND_REQUIRES_REVIEW';
    }
    if (!row) {
      [row] = await Refund.create([{ orderId: order.id, paymentId: payment.id, instructorId: order.instructorId,
        source: 'provider', kind: current.amountMinor === order.amountMinor ? 'full' : 'partial', amountMinor: current.amountMinor,
        paymentAmountMinor: order.amountMinor, currency: order.currency, providerRefundId: current.providerRefundId,
        paymentIntentId: current.paymentIntentId, providerCreatedAt: current.providerCreatedAt, status: 'pending',
      }], { session });
    }
    if (['succeeded', 'failed', 'cancelled'].includes(row.status)) {
      const expected = row.status === 'cancelled' ? 'canceled' : row.status;
      if (current.providerStatus !== expected) {
        await hold(context, payment, `contradiction:${row.id}`, 'PROVIDER_REFUND_CONTRADICTION');
        return 'REFUND_REQUIRES_REVIEW';
      }
      return null;
    }
    const fromStatus = row.status;
    const base = { providerRefundId: current.providerRefundId, providerCreatedAt: current.providerCreatedAt,
      providerStatus: current.providerStatus, providerObservedAt: now, lastReconciledAt: now,
      leaseId: null, leaseUntil: null, recoveryLeaseId: null, recoveryLeaseUntil: null,
      nextRecoveryAt: new Date(now.getTime() + 60_000), failureCode: null };
    if (['failed', 'canceled'].includes(current.providerStatus)) {
      if (row.providerStatus === 'succeeded') {
        await hold(context, payment, `contradiction:${row.id}`, 'PROVIDER_REFUND_CONTRADICTION');
        return 'REFUND_REQUIRES_REVIEW';
      }
      const status = current.providerStatus === 'failed' ? 'failed' : 'cancelled';
      await updateRefund(row, { ...base, status, nextRecoveryAt: null }, context);
      await resolve(context, { sourceType: 'refund', sourceId: row.id }, 'REFUND_CONFIRMED_NOT_COMPLETED');
      await audit(row, 'refund.failed', fromStatus, status, context);
      return null;
    }
    if (row.kind === 'partial') {
      await updateRefund(row, { ...base, status: 'requires_reconciliation', failureCode: 'PARTIAL_REFUND_REQUIRES_REVIEW' }, context);
      await hold(context, payment, row.id, 'PARTIAL_REFUND_REQUIRES_REVIEW', 'refund');
      return 'REFUND_REQUIRES_REVIEW';
    }
    await hold(context, payment, row.id, 'REFUND_PENDING', 'refund');
    if (current.providerStatus !== 'succeeded') {
      await updateRefund(row, { ...base, status: 'pending' }, context); return null;
    }
    if (order.status !== 'paid' || payment.status !== 'succeeded') throw mismatch();
    await applyFullRefundLedger({ refund: row, order, context, finance });
    const orderResult = await Order.updateOne({ _id: order.id, status: 'paid' },
      { $set: { status: 'refunded', purchaseSlotActive: false } }, { session });
    const paymentResult = await Payment.updateOne({ _id: payment.id, status: 'succeeded' }, { $set: { status: 'refunded' } }, { session });
    if (!orderResult.modifiedCount || !paymentResult.modifiedCount) throw mismatch();
    await Enrollment.updateOne({ studentId: order.studentId, courseId: order.courseId, sourceOrderId: order.id, status: 'active' },
      { $set: { status: 'revoked', revokedAt: now, revocationReason: 'refund', revocationSourceOrderId: order.id },
        $inc: { progressRevision: 1 } }, { session });
    await updateRefund(row, { ...base, status: 'succeeded', completedAt: now, nextRecoveryAt: null }, context);
    await resolve(context, { sourceType: 'refund', sourceId: row.id }, 'REFUND_CONFIRMED');
    await resolve(context, { paymentId: payment.id, reasonCode: 'CHARGE_REFUND_RECONCILIATION' }, 'FULL_REFUND_ACCOUNTED');
    await audit(row, 'refund.succeeded', fromStatus, 'succeeded', context);
    return null;
  }
  async function reduceSafety({ current, order, payment, context }) {
    if (current.kind === 'dispute') {
      await hold(context, payment, current.resourceId, 'PAYMENT_DISPUTE_REQUIRES_REVIEW', 'dispute');
      return 'REFUND_REQUIRES_REVIEW';
    }
    if (current.amountMinor !== order.amountMinor || current.currency !== order.currency
        || current.refundedAmountMinor > order.amountMinor) throw mismatch();
    if (new Set(current.refunds.map(value => value.providerRefundId)).size !== current.refunds.length
        || current.refunds.some(value => value.paymentIntentId !== payment.paymentIntentId
          || value.currency !== order.currency || value.payment.id !== current.payment.id
          || value.payment.orderId !== order.id || value.payment.amountMinor !== order.amountMinor
          || value.payment.amountReceivedMinor !== order.amountMinor)) throw mismatch();
    const totalConfirmed = sumMinorUnits(current.refunds.filter(value => value.providerStatus === 'succeeded').map(value => value.amountMinor));
    const totalInFlight = sumMinorUnits(current.refunds.filter(value => ['pending', 'requires_action', 'succeeded'].includes(value.providerStatus)).map(value => value.amountMinor));
    await Payment.updateOne({ _id: payment.id }, { $set: { providerRefundedAmountMinor: current.refundedAmountMinor } }, { session: context.session });
    for (const observation of current.refunds) {
      const event = refundObservationEvent(observation, context.now);
      if (!await WebhookEvent.exists({ provider: 'stripe', eventId: event.eventId }).session(context.session)) {
        await WebhookEvent.create([{ ...event, paymentIntentId: observation.paymentIntentId,
          lastReceivedAt: context.now, availableAt: context.now }], { session: context.session });
        await finance.openHold(context, { sourceType: 'operations', sourceId: financialEventSource(event.eventId),
          paymentId: payment.id, reasonCode: 'FINANCIAL_EVENT_PENDING' });
      }
    }
    if (totalConfirmed > current.refundedAmountMinor || current.refundedAmountMinor > totalInFlight) {
      // Allow counters that include an in-flight refund, but retain contradictory
      // aggregate proof for review rather than clearing it with one refund event.
      await hold(context, payment, `charge-total:${current.resourceId}`, 'CHARGE_REFUND_TOTAL_REQUIRES_REVIEW', 'payment');
      return 'REFUND_REQUIRES_REVIEW';
    }
    if (order.status === 'refunded' && totalConfirmed === current.refundedAmountMinor && current.refundedAmountMinor === order.amountMinor
        && await Refund.exists({ paymentId: payment.id, kind: 'full', status: 'succeeded' }).session(context.session)) {
      await resolve(context, { sourceType: 'payment', sourceId: `charge:${current.resourceId}` }, 'FULL_REFUND_ACCOUNTED');
      return null;
    }
    if (totalConfirmed === 0 && current.refundedAmountMinor === 0 && !current.refunds.some(value => ['pending', 'requires_action'].includes(value.providerStatus))
        && !await Refund.exists({ paymentId: payment.id, providerStatus: 'succeeded' }).session(context.session)) {
      await resolve(context, { sourceType: 'payment', sourceId: `charge:${current.resourceId}` }, 'PROVIDER_ZERO_REFUND_CONFIRMED');
      return null;
    }
    await hold(context, payment, `charge:${current.resourceId}`, 'CHARGE_REFUND_RECONCILIATION', 'payment');
    return 'REFUND_REQUIRES_REVIEW';
  }
  return Object.freeze({
    async fulfill({ job, current, signal }) {
      const guard = () => signal?.throwIfAborted(); guard();
      current = (current.kind === 'refund' ? refundObservationSchema : safetyObservationSchema).parse(current);
      const hint = await Payment.findOne({ provider: 'stripe', paymentIntentId: current.paymentIntentId }).select('orderId');
      const orderHint = hint && await Order.findById(hint.orderId).select('instructorId');
      if (!orderHint) throw pending();
      return finance.runForInstructor({ instructorId: String(orderHint.instructorId) }, async context => {
        const { session } = context; guard();
        const touched = await WebhookEvent.updateOne({ _id: job._id, status: 'processing', leaseId: job.leaseId,
          leaseUntil: { $gt: clock() }, $or: [{ processingRevision: { $lt: Number.MAX_SAFE_INTEGER } },
            { processingRevision: { $exists: false } }] }, { $inc: { processingRevision: 1 } }, { session });
        if (!touched.modifiedCount) throw leaseLost();
        const payment = await Payment.findById(hint.id).select('+paymentIntentId').session(session);
        const order = payment && await Order.findById(payment.orderId).session(session); guard();
        if (!order || !['paid', 'refunded'].includes(order.status) || !['succeeded', 'refunded'].includes(payment.status)) throw pending();
        const proof = current.payment;
        if (current.kind !== job.payload.kind || String(order.instructorId) !== context.instructorId || proof.id !== payment.paymentIntentId
            || proof.orderId !== order.id || proof.amountMinor !== order.amountMinor || proof.amountReceivedMinor !== order.amountMinor
            || proof.currency !== order.currency || payment.amountMinor !== order.amountMinor || payment.currency !== order.currency
            || (job.payload.paymentIntentId && job.payload.paymentIntentId !== current.paymentIntentId)
            || (current.kind === 'charge' && job.payload.chargeId !== current.resourceId)
            || (current.kind === 'dispute' && job.payload.disputeId !== current.resourceId)
            || (current.kind === 'refund' && (job.payload.providerRefundId !== current.providerRefundId
              || job.payload.amountMinor !== current.amountMinor || job.payload.currency !== current.currency))) throw mismatch();
        const review = await (current.kind === 'refund' ? reduceRefund : reduceSafety)({ current, order, payment, context }); guard();
        await resolve(context, { sourceType: 'operations', sourceId: financialEventSource(job.eventId) }, 'FINANCIAL_EVENT_ACCOUNTED'); guard();
        const finished = await WebhookEvent.updateOne({ _id: job._id, status: 'processing', leaseId: job.leaseId,
          leaseUntil: { $gt: clock() } }, { $set: { status: 'processed', processedAt: clock(), leaseId: null,
          leaseUntil: null, lastError: review } }, { session });
        if (!finished.modifiedCount) throw leaseLost(); guard();
      });
    },
  });
}
