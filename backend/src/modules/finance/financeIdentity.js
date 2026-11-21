import { createHash, randomUUID } from 'node:crypto';

import { z } from 'zod';

import { financialIdSchema, financialKeySchema, financialReasonSchema } from './finance.schemas.js';

const identitySchema = z.object({
  orderId: financialIdSchema,
  idempotencyKey: financialKeySchema,
  reason: financialReasonSchema,
  overrideWindow: z.boolean().default(false),
}).strict();

export function refundRequestIdentity(input) {
  const { orderId, reason, overrideWindow, idempotencyKey } = identitySchema.parse(input);
  // Stable field order and validated normalized input, never JSON.stringify(raw request).
  const requestFingerprint = createHash('sha256').update(JSON.stringify({
    action: 'refund.create', orderId, reason, overrideWindow,
  })).digest('hex');
  // Generate only for a new local reservation, then persist. Retries must load that
  // reservation's original provider key rather than call this function to send again.
  return { idempotencyKey, requestFingerprint, providerIdempotencyKey: `refund_${randomUUID()}` };
}
