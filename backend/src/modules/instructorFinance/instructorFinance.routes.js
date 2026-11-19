import { Router } from 'express';

import { env } from '../../config/env.js';
import { authenticate, authorize } from '../../middlewares/authenticate.js';
import { createAuthenticatedRateLimiter } from '../../middlewares/rateLimiter.js';
import { validateParams, validateQuery } from '../../middlewares/validate.js';
import { createInstructorFinanceController } from './instructorFinance.controller.js';
import { instructorEarningsQuery, instructorPayoutDetailQuery, instructorPayoutParams,
  instructorPayoutsQuery, instructorSalesQuery, instructorSummaryQuery } from './instructorFinance.schemas.js';

export function createInstructorFinanceRouter({ service, rateLimitStoreFactory }) {
  const router = Router();
  const handler = createInstructorFinanceController(service);
  const read = [authenticate, authorize('instructor'), createAuthenticatedRateLimiter({ namespace: 'instructor-finance',
    windowMs: env.PRIVATE_READ_RATE_LIMIT_WINDOW_MS, limit: env.PRIVATE_READ_RATE_LIMIT_MAX, storeFactory: rateLimitStoreFactory })];
  router.get('/finance/summary', ...read, validateQuery(instructorSummaryQuery), handler('summary'));
  router.get('/sales', ...read, validateQuery(instructorSalesQuery), handler('sales'));
  router.get('/earnings', ...read, validateQuery(instructorEarningsQuery), handler('earnings'));
  router.get('/payouts', ...read, validateQuery(instructorPayoutsQuery), handler('payouts'));
  router.get('/payouts/:payoutId', ...read, validateParams(instructorPayoutParams),
    validateQuery(instructorPayoutDetailQuery), handler('payout'));
  return router;
}
