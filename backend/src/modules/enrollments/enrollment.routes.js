import { Router } from 'express';

import { env } from '../../config/env.js';
import { authenticate, authorize } from '../../middlewares/authenticate.js';
import { noStore } from '../../middlewares/noStore.js';
import { createAuthenticatedRateLimiter } from '../../middlewares/rateLimiter.js';
import { validateBody, validateParams, validateQuery } from '../../middlewares/validate.js';
import { createEnrollmentController } from './enrollment.controller.js';
import { courseParamsSchema, enrollBodySchema, libraryQuerySchema } from './enrollment.schemas.js';

export function createFreeEnrollmentRouter({ enrollmentService, rateLimitStoreFactory }) {
  const router = Router();
  const controller = createEnrollmentController({ enrollmentService });
  const limit = createAuthenticatedRateLimiter({ namespace: 'enroll',
    windowMs: env.ENROLL_RATE_LIMIT_WINDOW_MS, limit: env.ENROLL_RATE_LIMIT_MAX,
    storeFactory: rateLimitStoreFactory });
  router.post('/:courseId/enroll', noStore, authenticate, authorize('student'), limit,
    validateParams(courseParamsSchema), validateBody(enrollBodySchema), controller.enroll);
  return router;
}

export function createLibraryRouter({ enrollmentService }) {
  const router = Router();
  const controller = createEnrollmentController({ enrollmentService });
  router.use(authorize('student'));
  router.get('/', validateQuery(libraryQuerySchema), controller.list);
  router.get('/:courseId', validateParams(courseParamsSchema), controller.get);
  return router;
}
