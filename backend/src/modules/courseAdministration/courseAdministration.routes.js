import { Router } from 'express';

import { env } from '../../config/env.js';
import { authenticate, authorize } from '../../middlewares/authenticate.js';
import { noStore } from '../../middlewares/noStore.js';
import { createAuthenticatedRateLimiter } from '../../middlewares/rateLimiter.js';
import { validateBody, validateParams, validateQuery } from '../../middlewares/validate.js';
import { createCourseAdministrationController } from './courseAdministration.controller.js';
import { correctionInputSchema, archiveCourseInputSchema, courseAccessInputSchema, courseAdministrationParamsSchema,
  emptyCoursePolicyQuerySchema } from './courseAdministration.schemas.js';

export function createCourseAdministrationRouter({ service, rateLimitStoreFactory }) {
  const router = Router();
  const controller = createCourseAdministrationController({ service });
  const limit = createAuthenticatedRateLimiter({ namespace: 'admin-course-policy',
    windowMs: env.ADMIN_WRITE_RATE_LIMIT_WINDOW_MS, limit: env.ADMIN_WRITE_RATE_LIMIT_MAX,
    storeFactory: rateLimitStoreFactory });
  // Method-specific middleware lets the existing review/list router keep its own auth/quota.
  const guards = [noStore, authenticate, authorize('admin'), limit,
    validateParams(courseAdministrationParamsSchema), validateQuery(emptyCoursePolicyQuerySchema)];
  router.post('/:courseId/archive', ...guards, validateBody(archiveCourseInputSchema), controller.archive);
  router.patch('/:courseId/access-policy', ...guards, validateBody(courseAccessInputSchema), controller.changeAccess);
  router.patch('/:courseId/corrections', ...guards, validateBody(correctionInputSchema), controller.correct);
  return router;
}
