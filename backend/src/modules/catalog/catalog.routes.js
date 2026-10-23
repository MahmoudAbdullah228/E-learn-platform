import { Router } from 'express';

import { env } from '../../config/env.js';
import { createPublicRateLimiter } from '../../middlewares/rateLimiter.js';
import { validateParams, validateQuery } from '../../middlewares/validate.js';
import { createCatalogController } from './catalog.controller.js';
import { catalogQuerySchema, catalogSlugSchema } from './catalog.schemas.js';

export function createCatalogRouter({ catalogService, rateLimitStoreFactory }) {
  const router = Router();
  const controller = createCatalogController({ catalogService });
  const limit = createPublicRateLimiter({
    namespace: 'catalog-courses', windowMs: env.CATALOG_RATE_LIMIT_WINDOW_MS,
    limit: env.CATALOG_RATE_LIMIT_MAX, storeFactory: rateLimitStoreFactory,
  });
  router.get('/', limit, validateQuery(catalogQuerySchema), controller.list);
  router.get('/:slug', limit, validateParams(catalogSlugSchema), controller.get);
  return router;
}
