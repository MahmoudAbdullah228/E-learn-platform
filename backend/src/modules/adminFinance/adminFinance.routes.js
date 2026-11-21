import { Router } from 'express';

import { env } from '../../config/env.js';
import { authenticate, authorize } from '../../middlewares/authenticate.js';
import { createAuthenticatedRateLimiter } from '../../middlewares/rateLimiter.js';
import { validateQuery } from '../../middlewares/validate.js';
import { createAdminFinanceController } from './adminFinance.controller.js';
import { adminDashboardQuery, adminFinanceSummaryQuery } from './adminFinance.schemas.js';

export function createAdminFinanceRouter({ service, rateLimitStoreFactory }) {
  const router = Router();
  const controller = createAdminFinanceController(service);
  const read = [authenticate, authorize('admin'), createAuthenticatedRateLimiter({ namespace: 'admin-finance',
    windowMs: env.PRIVATE_READ_RATE_LIMIT_WINDOW_MS, limit: env.PRIVATE_READ_RATE_LIMIT_MAX, storeFactory: rateLimitStoreFactory })];
  router.get('/dashboard', ...read, validateQuery(adminDashboardQuery), controller.dashboard);
  router.get('/finance/summary', ...read, validateQuery(adminFinanceSummaryQuery), controller.summary);
  return router;
}
