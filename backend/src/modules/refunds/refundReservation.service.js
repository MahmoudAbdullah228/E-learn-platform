import mongoose from 'mongoose';

import { EarningEntry } from '../../models/EarningEntry.js';
import { FinancialHold } from '../../models/FinancialHold.js';
import { FinancialPolicyVersion } from '../../models/FinancialPolicyVersion.js';
import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { Refund } from '../../models/Refund.js';
import { fenceActiveAdmin } from '../../services/adminAuthorization.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { appendAuditEvent } from '../audit/audit.service.js';
import { refundRequestIdentity } from '../finance/financeIdentity.js';
import { assertRefundAdmission, reconciliationRequired } from './refund.policy.js';

const activeStatuses = ['requested', 'processing', 'pending', 'requires_reconciliation'];
export const refundKeyConflict = () => new ApiError(409, 'IDEMPOTENCY_CONFLICT',
  'The request key was already used for a different refund request');

export function createRefundReservationService({ provider, finance, signal, clock }) {
  return async function reserve({ auth, orderId, input, idempotencyKey, requestId }) {
    const identity = refundRequestIdentity({ ...input, orderId, idempotencyKey });
    const priorHint = await Refund.findOne({ initiatedBy: auth.userId, idempotencyKey }).select('instructorId').lean();
    signal.throwIfAborted();
    const hint = priorHint ?? await Order.findById(orderId).select('instructorId').lean();
    if (!hint) {
      await mongoose.connection.transaction(async session => {
        await fenceActiveAdmin({ auth, session, now: clock() });
        throw new ApiError(404, 'ORDER_NOT_FOUND', 'Order was not found');
      });
    }
    return finance.runForInstructor({ instructorId: String(hint.instructorId) }, async context => {
      const { session, now } = context;
      signal.throwIfAborted();
      await fenceActiveAdmin({ auth, session, now });
      const prior = await Refund.findOne({ initiatedBy: auth.userId, idempotencyKey }).select('+requestFingerprint').session(session);
      signal.throwIfAborted();
      if (prior) {
        if (prior.requestFingerprint !== identity.requestFingerprint) throw refundKeyConflict();
        return { refund: prior, created: false };
      }
      if (typeof provider?.assertRefundReady !== 'function') {
        throw new ApiError(503, 'REFUND_SERVICE_UNAVAILABLE', 'Refund requests are temporarily unavailable');
      }
      provider.assertRefundReady(); // Synchronous configuration check only; no SDK call here.
      const order = await Order.findById(orderId).session(session);
      if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Order was not found');
      if (String(order.instructorId) !== context.instructorId) throw reconciliationRequired();
      const payment = await Payment.findOne({ orderId }).select('+paymentIntentId').session(session);
      const policy = order.policyVersionId && await FinancialPolicyVersion.findById(order.policyVersionId).session(session);
      const sale = await EarningEntry.findOne({ orderId, type: 'sale' }).session(session);
      signal.throwIfAborted();
      assertRefundAdmission({ order, payment, policy, sale, now, overrideWindow: input.overrideWindow });
      const priorFull = await Refund.findOne({ paymentId: payment.id, kind: 'full',
        status: { $in: [...activeStatuses, 'succeeded'] } }).select('status').session(session);
      if (priorFull) throw new ApiError(409, priorFull.status === 'succeeded' ? 'REFUND_ALREADY_COMPLETED' : 'REFUND_IN_PROGRESS',
        'A full refund already exists for this payment');
      const partial = await Refund.exists({ paymentId: payment.id, kind: 'partial', status: { $nin: ['failed', 'cancelled'] } }).session(session);
      const held = await FinancialHold.exists({ instructorId: order.instructorId, resolvedAt: null,
        $or: [{ paymentId: payment.id }, { paymentId: null,
          sourceType: { $in: ['legacy', 'operations', 'payment', 'dispute', 'refund'] } }] }).session(session);
      if (partial || held) throw reconciliationRequired();
      const [refund] = await Refund.create([{ orderId, paymentId: payment.id, instructorId: order.instructorId,
        source: 'admin', kind: 'full', initiatedBy: auth.userId, amountMinor: order.amountMinor,
        paymentAmountMinor: payment.amountMinor, currency: order.currency, ...input, ...identity,
        policyVersionId: order.policyVersionId, refundWindowSeconds: order.refundWindowSeconds,
        paymentConfirmedAt: order.paymentConfirmedAt, refundDeadlineAt: order.refundDeadlineAt,
        paymentIntentId: payment.paymentIntentId,
      }], { session });
      signal.throwIfAborted();
      await finance.openHold(context, { paymentId: payment.id, sourceType: 'refund', sourceId: refund.id,
        reasonCode: 'REFUND_PENDING', openedBy: auth.userId });
      await appendAuditEvent({ session, occurredAt: now, input: { actorType: 'user', actorId: auth.userId,
        action: 'refund.requested', targetType: 'refund', targetId: refund.id,
        fromStatus: null, toStatus: 'requested', reason: input.reason, requestId: requestId ?? null,
        idempotencyKey, requestFingerprint: identity.requestFingerprint,
        result: { resourceId: refund.id, status: 'requested', httpStatus: 202 },
      } });
      signal.throwIfAborted();
      return { refund, created: true };
    });
  };
}
