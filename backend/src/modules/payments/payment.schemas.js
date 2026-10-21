import { z } from 'zod';
import { ApiError } from '../../utils/ApiError.js';

export const checkoutEventTypes = Object.freeze([
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed', 'checkout.session.expired',
]);
const providerId = z.string().min(1).max(255);
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const envelope = z.object({
  id: providerId.regex(/^evt_/), type: providerId, livemode: z.literal(false),
  account: z.null().optional(),
  created: z.number().int().positive().max(8_640_000_000_000),
  data: z.object({ object: z.unknown() }),
});
const checkoutObject = z.object({
  object: z.literal('checkout.session'), id: providerId.regex(/^cs_test_/),
  livemode: z.literal(false), mode: z.literal('payment'),
  client_reference_id: objectId, metadata: z.object({ orderId: objectId }),
  amount_total: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.literal('egp'),
  expires_at: z.number().int().positive().max(8_640_000_000_000),
  status: z.enum(['open', 'complete', 'expired']),
  payment_status: z.enum(['unpaid', 'paid', 'no_payment_required']),
  payment_intent: z.union([providerId.regex(/^pi_/), z.object({ id: providerId.regex(/^pi_/) }),
    z.null()]),
});

export function parsePaymentEvent(input) {
  const parsed = envelope.safeParse(input);
  if (!parsed.success) throw new ApiError(400, 'INVALID_PAYMENT_EVENT', 'Invalid payment event');
  const event = parsed.data;
  if (!checkoutEventTypes.includes(event.type)) {
    return { eventId: event.id, eventType: event.type, ignored: true, payload: { created: event.created } };
  }
  const object = checkoutObject.safeParse(event.data.object);
  if (!object.success) throw new ApiError(400, 'INVALID_PAYMENT_EVENT', 'Invalid payment event');
  const s = object.data;
  return { eventId: event.id, eventType: event.type, ignored: false, payload: {
    created: event.created, sessionId: s.id, orderId: s.client_reference_id,
    metadataOrderId: s.metadata.orderId, amountMinor: s.amount_total, currency: 'EGP',
    expiresAtSeconds: s.expires_at, status: s.status, paymentStatus: s.payment_status,
    paymentIntentId: typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null,
  } };
}
