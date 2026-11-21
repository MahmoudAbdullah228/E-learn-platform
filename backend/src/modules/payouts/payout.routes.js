import { Router } from 'express';

import { env } from '../../config/env.js';
import { authenticate, authorize } from '../../middlewares/authenticate.js';
import { noStore } from '../../middlewares/noStore.js';
import { createAuthenticatedRateLimiter } from '../../middlewares/rateLimiter.js';
import { validateBody, validateParams, validateQuery } from '../../middlewares/validate.js';
import { createPayoutController } from './payout.controller.js';
import { createPayoutSchema, emptyQuerySchema, instructorIdSchema,
  payoutCommandSchemas, payoutIdSchema, payoutListSchema, payoutPeriodSchema } from './payout.schemas.js';

export function createPayoutRouter({ service, rateLimitStoreFactory }) {
  const router = Router();
  const controller = createPayoutController(service);
  const admin = [noStore, authenticate, authorize('admin')];
  const read = createAuthenticatedRateLimiter({ namespace: 'admin-payouts-read',
    windowMs: env.PRIVATE_READ_RATE_LIMIT_WINDOW_MS, limit: env.PRIVATE_READ_RATE_LIMIT_MAX, storeFactory: rateLimitStoreFactory });
  const write = createAuthenticatedRateLimiter({ namespace: 'admin-payouts-write',
    windowMs: env.ADMIN_WRITE_RATE_LIMIT_WINDOW_MS, limit: env.ADMIN_WRITE_RATE_LIMIT_MAX, storeFactory: rateLimitStoreFactory });
  router.get('/instructors/:instructorId/settlement-preview', ...admin, read,
    validateParams(instructorIdSchema), validateQuery(payoutPeriodSchema), controller.preview);
  router.get('/payouts', ...admin, read, validateQuery(payoutListSchema), controller.list);
  router.get('/payouts/:payoutId', ...admin, read, validateParams(payoutIdSchema), validateQuery(emptyQuerySchema), controller.get);
  router.post('/payouts', ...admin, write, validateQuery(emptyQuerySchema), validateBody(createPayoutSchema), controller.create);
  for (const [command, schema] of Object.entries(payoutCommandSchemas)) {
    router.post(`/payouts/:payoutId/${command}`, ...admin, write, validateParams(payoutIdSchema),
      validateQuery(emptyQuerySchema), validateBody(schema), controller.transition(command));
  }
  return router;
}
