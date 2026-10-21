import { Router } from 'express';

import { env } from '../../config/env.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { createAuthenticatedRateLimiter } from '../../middlewares/rateLimiter.js';
import { validateBody, validateParams } from '../../middlewares/validate.js';
import { createMediaController } from './media.controller.js';
import { assetParamsSchema, emptyBodySchema, intentSchema } from './media.schemas.js';

export function createMediaRouter({ mediaService, rateLimitStoreFactory }) {
  const router = Router();
  const controller = createMediaController({ mediaService });
  router.use((request, response, next) => {
    void request;
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use(authenticate);
  const intentLimit = createAuthenticatedRateLimiter({
    namespace: 'media-intent', windowMs: env.MEDIA_INTENT_RATE_LIMIT_WINDOW_MS,
    limit: env.MEDIA_INTENT_RATE_LIMIT_MAX, storeFactory: rateLimitStoreFactory,
  });
  const actionLimit = createAuthenticatedRateLimiter({
    namespace: 'media-action', windowMs: env.MEDIA_ACTION_RATE_LIMIT_WINDOW_MS,
    limit: env.MEDIA_ACTION_RATE_LIMIT_MAX, storeFactory: rateLimitStoreFactory,
  });
  router.post('/upload-intents', intentLimit, validateBody(intentSchema), controller.createIntent);
  router.post('/:assetId/confirm', actionLimit, validateParams(assetParamsSchema),
    validateBody(emptyBodySchema), controller.confirm);
  router.delete('/:assetId', actionLimit, validateParams(assetParamsSchema), controller.remove);
  return router;
}
