import { WebhookEvent } from '../../models/WebhookEvent.js';
import { ApiError } from '../../utils/ApiError.js';
import { parsePaymentEvent } from './payment.schemas.js';

export function createPaymentInboxService({ provider, clock = () => new Date() }) {
  async function persist(input) {
    const { eventId, eventType, ignored, payload } = parsePaymentEvent(input);
    const now = clock();
    try {
      await WebhookEvent.create([{ eventId, eventType, payload,
        status: ignored ? 'ignored' : 'pending', lastReceivedAt: now, availableAt: now,
        processedAt: ignored ? now : null }], { writeConcern: { w: 'majority' } });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      // Redelivery never replaces trusted evidence or reopens a terminal event.
      const result = await WebhookEvent.updateOne({ provider: 'stripe', eventId, eventType },
        { $set: { lastReceivedAt: now } }, { writeConcern: { w: 'majority' } });
      if (!result.matchedCount) throw new ApiError(409, 'PAYMENT_EVENT_CONFLICT',
        'Payment event conflicts with an existing record');
    }
  }
  return Object.freeze({
    async receive({ rawBody, signature }) {
      await persist(provider.unwrapWebhook({ rawBody, signature }));
    },
    async recover(eventId) {
      // Authenticated provider retrieval is the only alternative to signature verification.
      const event = await provider.retrieveEvent(eventId);
      if (event?.id !== eventId) throw new ApiError(409, 'PAYMENT_EVENT_CONFLICT',
        'Payment event conflicts with the requested record');
      await persist(event);
    },
    async replay(eventId) {
      return WebhookEvent.updateOne({ provider: 'stripe', eventId, status: 'failed', leaseId: null },
        { $set: { status: 'pending', attempts: 0, lastError: null, availableAt: clock() } },
        { writeConcern: { w: 'majority' } });
    },
  });
}
