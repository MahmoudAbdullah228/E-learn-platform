import { Router } from 'express';
import { env } from '../../config/env.js';
import { authenticate, authorize } from '../../middlewares/authenticate.js';
import { noStore } from '../../middlewares/noStore.js';
import { createAuthenticatedRateLimiter } from '../../middlewares/rateLimiter.js';
import { validateBody, validateParams, validateQuery } from '../../middlewares/validate.js';
import { createRefundController } from './refund.controller.js';
import { createRefundInputSchema, emptyRefundQuerySchema, refundIdParamsSchema, refundKeySchema,
  refundListQuerySchema, refundOrderParamsSchema } from './refund.schemas.js';

export function createRefundRouters({ service, rateLimitStoreFactory }) {
  const reads = Router(); const requests = Router();
  const controller = createRefundController({ service });
  const limit = (namespace, write) => createAuthenticatedRateLimiter({ namespace,
    windowMs: write ? env.ADMIN_WRITE_RATE_LIMIT_WINDOW_MS : env.PRIVATE_READ_RATE_LIMIT_WINDOW_MS,
    limit: write ? env.ADMIN_WRITE_RATE_LIMIT_MAX : env.PRIVATE_READ_RATE_LIMIT_MAX, storeFactory: rateLimitStoreFactory });
  reads.use(noStore, authenticate, authorize('admin'), limit('admin-refunds-read', false));
  reads.get('/', validateQuery(refundListQuerySchema), controller.list);
  reads.get('/:refundId', validateParams(refundIdParamsSchema), validateQuery(emptyRefundQuerySchema), controller.get);
  requests.post('/:orderId/refunds', noStore, authenticate, authorize('admin'), limit('admin-refunds-write', true),
    validateParams(refundOrderParamsSchema), validateQuery(emptyRefundQuerySchema),
    (request, response, next) => {
      const result = refundKeySchema.safeParse({ idempotencyKey: request.get('Idempotency-Key') });
      if (!result.success) return next(result.error);
      request.refundKey = result.data.idempotencyKey; next();
    }, validateBody(createRefundInputSchema), controller.create);
  return { reads, requests };
}
