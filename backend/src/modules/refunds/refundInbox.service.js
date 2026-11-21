import { createHash } from 'node:crypto';

import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { WebhookEvent } from '../../models/WebhookEvent.js';
import { ApiError } from '../../utils/ApiError.js';
import { createFinanceFoundationService } from '../finance/finance.service.js';
import { refundObservationSchema } from './refundEvent.schemas.js';

export const financialEventSource = eventId => `event:${createHash('sha256').update(eventId).digest('hex')}`;
export function refundObservationEvent(input, now) {
  const observation = refundObservationSchema.parse(input);
  return { eventId: `evt_reconcile_${createHash('sha256').update(JSON.stringify(observation)).digest('hex')}`,
    eventType: 'refund.reconciled', origin: 'reconciliation', payload: {
      kind: 'refund', paymentIntentId: observation.paymentIntentId, providerRefundId: observation.providerRefundId,
      amountMinor: observation.amountMinor, currency: observation.currency, providerStatus: observation.providerStatus,
      providerCreated: observation.providerCreatedAt.getTime() / 1000, correlation: observation.correlation,
      metadataConflict: observation.metadataConflict, created: Math.floor(now.getTime() / 1000),
    } };
}

export function createRefundInboxService({ clock = () => new Date() } = {}) {
  const finance = createFinanceFoundationService({ clock });
  async function store({ eventId, eventType, payload, origin = 'stripe' }, session, now) {
    const prior = await WebhookEvent.findOne({ provider: 'stripe', eventId }).session(session ?? null);
    if (prior) {
      if (prior.eventType !== eventType || prior.origin !== origin) {
        throw new ApiError(409, 'PAYMENT_EVENT_CONFLICT', 'Payment event conflicts with an existing record');
      }
      await WebhookEvent.updateOne({ _id: prior.id }, { $set: { lastReceivedAt: now } }, { ...(session ? { session } : {}) });
      return false;
    }
    await WebhookEvent.create([{ eventId, eventType, origin, payload, paymentIntentId: payload.paymentIntentId,
      lastReceivedAt: now, availableAt: now }], session ? { session } : { writeConcern: { w: 'majority' } });
    return true;
  }
  async function persist(event, { signal } = {}) {
    signal?.throwIfAborted();
    const payment = event.payload.paymentIntentId
      && await Payment.findOne({ provider: 'stripe', paymentIntentId: event.payload.paymentIntentId }).select('orderId');
    const orderId = payment?.orderId ?? event.payload.correlation?.orderId;
    const order = orderId && await Order.findById(orderId).select('instructorId');
    signal?.throwIfAborted();
    try {
      if (!order) { await store(event, null, clock()); return; }
      await finance.runForInstructor({ instructorId: String(order.instructorId) }, async context => {
        signal?.throwIfAborted();
        const created = await store(event, context.session, context.now);
        if (created) await finance.openHold(context, { sourceType: 'operations', sourceId: financialEventSource(event.eventId),
          paymentId: payment?.id ?? null, reasonCode: 'FINANCIAL_EVENT_PENDING' });
        signal?.throwIfAborted();
      });
    } catch (error) {
      if (error?.code === 'FINANCIAL_ACCOUNT_NOT_FOUND') {
        // Preserve trusted evidence for an orphan account without creating a new
        // financial identity or granting permission to settle it.
        signal?.throwIfAborted(); await store(event, null, clock()); return;
      }
      if (error?.code !== 11000) throw error;
      const prior = await WebhookEvent.exists({ provider: 'stripe', eventId: event.eventId, eventType: event.eventType,
        origin: event.origin ?? 'stripe' });
      if (!prior) throw new ApiError(409, 'PAYMENT_EVENT_CONFLICT', 'Payment event conflicts with an existing record');
    }
  }
  return Object.freeze({
    persist,
    async recordObservation(input, options) {
      const event = refundObservationEvent(input, clock());
      await persist(event, options); return event.eventId;
    },
  });
}
