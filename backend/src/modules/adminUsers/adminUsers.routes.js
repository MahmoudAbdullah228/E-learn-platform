import { Router } from 'express';

import { env } from '../../config/env.js';
import { authenticate, authorize } from '../../middlewares/authenticate.js';
import { noStore } from '../../middlewares/noStore.js';
import { createAuthenticatedRateLimiter } from '../../middlewares/rateLimiter.js';
import { validateBody, validateParams, validateQuery } from '../../middlewares/validate.js';
import { createAdminUsersController } from './adminUsers.controller.js';
import { adminUserParamsSchema, adminUsersQuerySchema, userStatusInputSchema } from './adminUsers.schemas.js';

export function createAdminUsersRouter({ service, rateLimitStoreFactory }) {
  const router = Router();
  const controller = createAdminUsersController({ service });
  const readLimit = createAuthenticatedRateLimiter({ namespace: 'admin-users-read',
    windowMs: env.PRIVATE_READ_RATE_LIMIT_WINDOW_MS, limit: env.PRIVATE_READ_RATE_LIMIT_MAX,
    storeFactory: rateLimitStoreFactory });
  const writeLimit = createAuthenticatedRateLimiter({ namespace: 'admin-users-write',
    windowMs: env.ADMIN_WRITE_RATE_LIMIT_WINDOW_MS, limit: env.ADMIN_WRITE_RATE_LIMIT_MAX,
    storeFactory: rateLimitStoreFactory });
  router.use(noStore, authenticate, authorize('admin'));
  router.get('/', readLimit, validateQuery(adminUsersQuerySchema), controller.list);
  router.get('/:userId', readLimit, validateParams(adminUserParamsSchema),
    validateQuery(adminUsersQuerySchema.pick({})), controller.get);
  router.patch('/:userId/status', writeLimit, validateParams(adminUserParamsSchema),
    validateQuery(adminUsersQuerySchema.pick({})), validateBody(userStatusInputSchema), controller.changeStatus);
  return router;
}
