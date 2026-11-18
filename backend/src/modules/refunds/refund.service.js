import { env } from '../../config/env.js';
import { logger, serializeError } from '../../config/logger.js';
import { Refund } from '../../models/Refund.js';
import { ApiError } from '../../utils/ApiError.js';
import { adminActorSchema } from '../../utils/actorSchemas.js';
import { createKeysetCursor } from '../../utils/keysetCursor.js';
import { createFinanceFoundationService } from '../finance/finance.service.js';
import { financialIdSchema, financialKeySchema } from '../finance/finance.schemas.js';
import { createRefundInputSchema } from './refund.schemas.js';
import { toAcceptedRefund, toRefund } from './refund.presenter.js';
import { createRefundIssuanceService } from './refundIssuance.service.js';
import { createRefundReservationService, refundKeyConflict } from './refundReservation.service.js';

const cursor = createKeysetCursor({ namespace: 'admin-refunds-cursor:v1', normalizeFilters: ({ status, orderId }) =>
  ({ status: status ?? null, orderId: orderId ?? null }) });
const shuttingDown = () => new ApiError(503, 'SERVICE_SHUTTING_DOWN', 'The API is shutting down');

export function createRefundService({ provider, clock = () => new Date(), shutdownTimeoutMs = 10_000,
  operationTimeoutMs = env.STRIPE_API_TIMEOUT_MS + 1000 } = {}) {
  const finance = createFinanceFoundationService({ clock });
  const controller = new AbortController(); const { signal } = controller;
  const running = new Set();
  const reserve = createRefundReservationService({ provider, finance, clock, signal });
  const issuance = createRefundIssuanceService({ provider, finance, shutdownSignal: signal, operationTimeoutMs });
  return Object.freeze({
    async create({ auth, orderId, input, idempotencyKey, requestId }) {
      if (signal.aborted) throw shuttingDown();
      auth = adminActorSchema.parse(auth); orderId = financialIdSchema.parse(orderId);
      input = createRefundInputSchema.parse(input); idempotencyKey = financialKeySchema.parse(idempotencyKey);
      const work = (async () => {
        let reserved;
        try { reserved = await reserve({ auth, orderId, input, idempotencyKey, requestId }); }
        catch (error) {
          if (signal.aborted) throw shuttingDown();
          if (error?.code === 11000) throw refundKeyConflict();
          throw error;
        }
        if (reserved.created && !signal.aborted) {
          try { await issuance.issue({ refundId: reserved.refund.id, instructorId: String(reserved.refund.instructorId) }); }
          catch (error) { logger.error(serializeError(error), 'Accepted refund dispatch requires recovery'); }
        }
        return toAcceptedRefund(reserved.refund);
      })();
      running.add(work);
      try { return await work; } finally { running.delete(work); }
    },
    async list(query) {
      const after = cursor.decode(query.cursor, query);
      const filter = { ...(query.status ? { status: query.status } : {}), ...(query.orderId ? { orderId: query.orderId } : {}) };
      if (after) filter.$or = [{ createdAt: { $lt: after.createdAt } }, { createdAt: after.createdAt, _id: { $lt: after.id } }];
      const rows = await Refund.find(filter).sort({ createdAt: -1, _id: -1 }).limit(query.limit + 1).maxTimeMS(5000).lean();
      const page = rows.slice(0, query.limit); const hasMore = rows.length > query.limit;
      return { refunds: page.map(toRefund), pagination: { hasMore, nextCursor: hasMore ? cursor.encode(page.at(-1), query) : null } };
    },
    async get(refundId) {
      const refund = await Refund.findById(financialIdSchema.parse(refundId)).maxTimeMS(5000).lean();
      if (!refund) throw new ApiError(404, 'REFUND_NOT_FOUND', 'Refund was not found');
      return toRefund(refund);
    },
    async stop() {
      controller.abort(shuttingDown());
      let timer;
      try { await Promise.race([Promise.allSettled([...running]), new Promise(resolve => { timer = setTimeout(resolve, shutdownTimeoutMs); })]); }
      finally { clearTimeout(timer); }
    },
  });
}
