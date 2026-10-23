import { Router } from 'express';

import { env } from '../../config/env.js';
import { authenticate, authorize } from '../../middlewares/authenticate.js';
import {
  createAuthenticatedRateLimiter, createPublicRateLimiter,
} from '../../middlewares/rateLimiter.js';
import { validateBody, validateParams, validateQuery } from '../../middlewares/validate.js';
import { createCategoriesController } from './categories.controller.js';
import {
  adminCategoriesQuerySchema, categoryIdParamsSchema, createCategorySchema,
  publicCategoriesQuerySchema, updateCategorySchema,
} from './categories.schemas.js';

export function createPublicCategoriesRouter({ categoriesService, rateLimitStoreFactory }) {
  const router = Router();
  const controller = createCategoriesController({ categoriesService });
  const limit = createPublicRateLimiter({
    namespace: 'catalog-categories', windowMs: env.CATALOG_RATE_LIMIT_WINDOW_MS,
    limit: env.CATALOG_RATE_LIMIT_MAX, storeFactory: rateLimitStoreFactory,
  });
  router.get('/', limit, validateQuery(publicCategoriesQuerySchema), controller.listPublic);
  return router;
}

export function createAdminCategoriesRouter({ categoriesService, rateLimitStoreFactory }) {
  const router = Router();
  const controller = createCategoriesController({ categoriesService });
  const writeLimit = createAuthenticatedRateLimiter({
    namespace: 'admin-write', windowMs: env.ADMIN_WRITE_RATE_LIMIT_WINDOW_MS,
    limit: env.ADMIN_WRITE_RATE_LIMIT_MAX, storeFactory: rateLimitStoreFactory,
  });
  router.use((request, response, next) => {
    void request;
    response.set('Cache-Control', 'no-store');
    next();
  }, authenticate, authorize('admin'));
  router.route('/')
    .get(validateQuery(adminCategoriesQuerySchema), controller.listAdmin)
    .post(writeLimit, validateBody(createCategorySchema), controller.create);
  router.patch('/:categoryId', writeLimit, validateParams(categoryIdParamsSchema),
    validateBody(updateCategorySchema), controller.update);
  return router;
}
