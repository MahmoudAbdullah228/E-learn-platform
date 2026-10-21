import Stripe from 'stripe';

import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

function unavailable() {
  return new ApiError(503, 'PAYMENT_PROVIDER_UNAVAILABLE',
    'Payment processing is temporarily unavailable');
}

function invalidSignature() {
  return new ApiError(400, 'INVALID_PAYMENT_WEBHOOK_SIGNATURE',
    'The payment webhook signature is invalid');
}

function checkoutUrl(baseUrl, sessionIdParameter = false) {
  const url = new URL(baseUrl);
  if (sessionIdParameter) url.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
  return url.toString().replace('%7BCHECKOUT_SESSION_ID%7D', '{CHECKOUT_SESSION_ID}');
}

function toCheckoutSession(session) {
  if (typeof session?.id !== 'string' || !session.id || session.livemode !== false || session.mode !== 'payment'
      || !['open', 'complete', 'expired'].includes(session.status)
      || !['paid', 'unpaid', 'no_payment_required'].includes(session.payment_status)
      || !Number.isSafeInteger(session.amount_total) || session.amount_total <= 0
      || session.currency !== 'egp' || !Number.isSafeInteger(session.expires_at)
      || session.expires_at <= 0 || session.expires_at > 8_640_000_000_000
      || typeof session.client_reference_id !== 'string'
      || typeof session.metadata?.orderId !== 'string') throw unavailable();
  if (session.status === 'open' && (typeof session.url !== 'string'
      || !URL.canParse(session.url) || new URL(session.url).protocol !== 'https:'
      || new URL(session.url).hostname !== 'checkout.stripe.com'
      || new URL(session.url).username || new URL(session.url).password)) throw unavailable();
  const intent = session.payment_intent;
  return { id: session.id, url: session.status === 'open' ? session.url : null,
    expiresAt: new Date(session.expires_at * 1000), status: session.status,
    paymentStatus: session.payment_status, amountMinor: session.amount_total, currency: 'EGP',
    orderId: session.client_reference_id, metadataOrderId: session.metadata.orderId,
    paymentIntentId: typeof intent === 'string' ? intent : intent?.id ?? null,
    paymentIntentStatus: typeof intent === 'object' ? intent?.status ?? null : null,
    paymentIntent: intent && typeof intent === 'object' ? {
      id: intent.id, status: intent.status, livemode: intent.livemode,
      amountMinor: intent.amount, amountReceivedMinor: intent.amount_received,
      currency: intent.currency?.toUpperCase(), orderId: intent.metadata?.orderId,
    } : null };
}

function assertCheckoutInput({
  orderId, courseTitle, amountMinor, customerEmail, idempotencyKey, expiresAtSeconds,
}) {
  if (![orderId, courseTitle, customerEmail, idempotencyKey]
    .every(value => typeof value === 'string' && value.length > 0)) {
    throw new TypeError('Complete server-owned checkout data is required');
  }
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new TypeError('Checkout amount must be a positive safe integer');
  }
  if (!Number.isSafeInteger(expiresAtSeconds) || expiresAtSeconds <= 0
      || expiresAtSeconds > 8_640_000_000_000) {
    throw new TypeError('A persisted Checkout expiry in Unix seconds is required');
  }
}

export function createStripePaymentProvider({
  secretKey = env.STRIPE_SECRET_KEY,
  webhookSecret = env.STRIPE_WEBHOOK_SECRET,
  successUrl = env.STRIPE_CHECKOUT_SUCCESS_URL,
  cancelUrl = env.STRIPE_CHECKOUT_CANCEL_URL,
  webhookToleranceSeconds = env.STRIPE_WEBHOOK_TOLERANCE_SECONDS,
  apiTimeoutMs = env.STRIPE_API_TIMEOUT_MS,
  checkoutExpiresSeconds = env.STRIPE_CHECKOUT_EXPIRES_SECONDS,
  stripeClient,
} = {}) {
  const stripe = stripeClient ?? (secretKey
    ? new Stripe(secretKey, { maxNetworkRetries: 2, timeout: apiTimeoutMs })
    : null);
  const configured = Boolean(stripe && secretKey && webhookSecret && successUrl && cancelUrl);

  return Object.freeze({
    checkoutSettings() {
      if (!configured) throw unavailable();
      return { successUrl, cancelUrl, checkoutExpiresSeconds };
    },
    async createCheckoutSession(input) {
      if (!configured) throw unavailable();
      assertCheckoutInput(input);
      // The caller persists this snapshot before the first request and reuses it on retries.
      const {
        orderId, courseTitle, amountMinor, customerEmail, idempotencyKey, expiresAtSeconds,
      } = input;
      let session;
      try {
        session = await stripe.checkout.sessions.create({
          mode: 'payment',
          success_url: checkoutUrl(input.successUrl ?? successUrl, true),
          cancel_url: checkoutUrl(input.cancelUrl ?? cancelUrl),
          client_reference_id: orderId,
          customer_email: customerEmail,
          payment_method_types: ['card'],
          line_items: [{
            price_data: {
              currency: 'egp',
              unit_amount: amountMinor,
              product_data: { name: courseTitle },
            },
            quantity: 1,
          }],
          metadata: { orderId },
          payment_intent_data: { metadata: { orderId } },
          expires_at: expiresAtSeconds,
        }, { idempotencyKey });
      } catch (error) {
        // These explicit validation codes prove that no checkout was allocated by this request.
        if (error?.type === 'StripeInvalidRequestError'
            && ['amount_too_small', 'amount_too_large'].includes(error.code)) {
          throw new ApiError(409, 'PAYMENT_AMOUNT_UNSUPPORTED',
            'The course price cannot be processed by the payment provider');
        }
        throw unavailable();
      }

      return toCheckoutSession(session);
    },

    async retrieveCheckoutSession(sessionId) {
      if (!configured) throw unavailable();
      try {
        return toCheckoutSession(await stripe.checkout.sessions.retrieve(sessionId,
          { expand: ['payment_intent'] }));
      } catch { throw unavailable(); }
    },

    async findCheckoutSession({ orderId, createdAfter, createdBefore }) {
      if (!configured) throw unavailable();
      try {
        let startingAfter;
        let match;
        for (let page = 0; page < 20; page += 1) {
          const result = await stripe.checkout.sessions.list({ limit: 100,
            created: { gte: createdAfter, lte: createdBefore },
            expand: ['data.payment_intent'],
            ...(startingAfter ? { starting_after: startingAfter } : {}) });
          if (!Array.isArray(result.data)) throw unavailable();
          for (const session of result.data) {
            if (session.client_reference_id !== orderId && session.metadata?.orderId !== orderId)
              continue;
            if (match && match.id !== session.id) throw unavailable();
            match = toCheckoutSession(session);
          }
          if (result.has_more === false) return match ?? null;
          startingAfter = result.data.at(-1)?.id;
          if (!startingAfter) throw unavailable();
        }
        throw unavailable(); // Never treat an incomplete lookup as proof of absence.
      } catch { throw unavailable(); }
    },

    async retrieveEvent(eventId) {
      if (!configured) throw unavailable();
      try { return await stripe.events.retrieve(eventId); }
      catch { throw unavailable(); }
    },

    async findCheckoutEventIds({ orderId, createdAfter, createdBefore }) {
      if (!configured) throw unavailable();
      try {
        const ids = new Set();
        let startingAfter;
        for (let page = 0; page < 10; page += 1) {
          const result = await stripe.events.list({ limit: 100,
            types: ['checkout.session.completed', 'checkout.session.async_payment_succeeded',
              'checkout.session.async_payment_failed', 'checkout.session.expired'],
            created: { gte: createdAfter, lte: createdBefore },
            ...(startingAfter ? { starting_after: startingAfter } : {}) });
          if (!Array.isArray(result.data)) throw unavailable();
          for (const event of result.data) {
            const object = event.data?.object;
            if (object?.client_reference_id === orderId || object?.metadata?.orderId === orderId) {
              if (typeof event.id !== 'string' || (!ids.has(event.id) && ids.size >= 100)) throw unavailable();
              ids.add(event.id);
            }
          }
          if (result.has_more === false) return [...ids];
          startingAfter = result.data.at(-1)?.id;
          if (!startingAfter) throw unavailable();
        }
        throw unavailable(); // A partial scan is never presented as complete reconciliation.
      } catch { throw unavailable(); }
    },

    unwrapWebhook({ rawBody, signature }) {
      if (!configured || !Buffer.isBuffer(rawBody) || typeof signature !== 'string') {
        throw invalidSignature();
      }
      try {
        return stripe.webhooks.constructEvent(
          rawBody,
          signature,
          webhookSecret,
          webhookToleranceSeconds,
        );
      } catch {
        throw invalidSignature();
      }
    },
  });
}

export const stripePaymentProvider = createStripePaymentProvider();
