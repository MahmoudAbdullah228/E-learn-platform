import { Router } from 'express';

import { env } from '../../config/env.js';
import { authenticate, authorize } from '../../middlewares/authenticate.js';
import { createAuthenticatedRateLimiter } from '../../middlewares/rateLimiter.js';
import { validateBody, validateParams } from '../../middlewares/validate.js';
import { createCheckoutController } from './checkout.controller.js';
import { checkoutBodySchema, checkoutParamsSchema } from './checkout.schemas.js';

export function createCheckoutRouter({ checkoutService, rateLimitStoreFactory }) {
  const router = Router();
  const limit = createAuthenticatedRateLimiter({ namespace: 'checkout',
    windowMs: env.CHECKOUT_RATE_LIMIT_WINDOW_MS, limit: env.CHECKOUT_RATE_LIMIT_MAX,
    storeFactory: rateLimitStoreFactory });
  router.post('/:courseId/checkout', (request, response, next) => {
    void request;
    response.set('Cache-Control', 'no-store');
    next();
  }, authenticate, authorize('student'), limit, validateParams(checkoutParamsSchema),
  validateBody(checkoutBodySchema), createCheckoutController({ checkoutService }));
  return router;
}
