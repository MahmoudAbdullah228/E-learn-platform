import { z } from 'zod';

import { Order } from '../../models/Order.js';
import { ApiError } from '../../utils/ApiError.js';

export const paymentOperationSchema = z.object({
  eventId: z.string().regex(/^evt_[a-zA-Z0-9_]+$/).max(255).optional(),
  orderId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  replay: z.boolean().default(false), execute: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  if (Boolean(value.eventId) === Boolean(value.orderId) || (value.replay && !value.eventId)) {
    context.addIssue({ code: 'custom', message: 'Choose one event ID or order ID; replay requires an event ID' });
  }
});

export function createPaymentOperationsService({ provider, inbox, clock = () => new Date() }) {
  return Object.freeze({
    async run(input) {
      const operation = paymentOperationSchema.parse(input);
      if (!operation.execute) return { dryRun: true, queued: 0 };
      if (operation.replay) {
        const result = await inbox.replay(operation.eventId);
        return { dryRun: false, queued: result.modifiedCount };
      }
      if (operation.eventId) {
        await inbox.recover(operation.eventId);
        return { dryRun: false, queued: 1 };
      }
      const order = await Order.findById(operation.orderId);
      if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Order was not found');
      const now = clock();
      const createdAfter = Math.floor(order.createdAt.getTime() / 1000) - 60;
      if (createdAfter < Math.floor(now.getTime() / 1000) - 30 * 86400) {
        throw new ApiError(409, 'PAYMENT_EVENT_RETENTION_EXCEEDED',
          'Provider event history is outside the recovery window');
      }
      const eventIds = await provider.findCheckoutEventIds({ orderId: order.id, createdAfter,
        createdBefore: Math.floor(now.getTime() / 1000) });
      for (const id of eventIds) await inbox.recover(id);
      return { dryRun: false, queued: eventIds.length };
    },
  });
}
