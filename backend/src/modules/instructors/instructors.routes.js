import { Router } from 'express';

import { env } from '../../config/env.js';
import { authenticate, authorize } from '../../middlewares/authenticate.js';
import {
  createAuthenticatedRateLimiter,
  createPublicRateLimiter,
} from '../../middlewares/rateLimiter.js';
import { validateBody, validateParams } from '../../middlewares/validate.js';
import { createInstructorsController } from './instructors.controller.js';
import {
  instructorIdParamsSchema,
  updateInstructorProfileSchema,
} from './instructors.schemas.js';

export function createPublicInstructorsRouter({ instructorsService, rateLimitStoreFactory }) {
  const router = Router();
  const controller = createInstructorsController({ instructorsService });
  const limiter = createPublicRateLimiter({
    namespace: 'catalog',
    windowMs: env.CATALOG_RATE_LIMIT_WINDOW_MS,
    limit: env.CATALOG_RATE_LIMIT_MAX,
    storeFactory: rateLimitStoreFactory,
  });
  router.get('/:instructorId', limiter, validateParams(instructorIdParamsSchema),
    controller.getPublicProfile);
  return router;
}

export function createInstructorProfileRouter({ instructorsService, rateLimitStoreFactory }) {
  const router = Router();
  const controller = createInstructorsController({ instructorsService });
  const limiter = createAuthenticatedRateLimiter({
    namespace: 'instructor-profile',
    windowMs: env.INSTRUCTOR_PROFILE_RATE_LIMIT_WINDOW_MS,
    limit: env.INSTRUCTOR_PROFILE_RATE_LIMIT_MAX,
    storeFactory: rateLimitStoreFactory,
  });

  router.use((request, response, next) => {
    void request;
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.patch('/profile', authenticate, authorize('instructor'), limiter,
    validateBody(updateInstructorProfileSchema), controller.updateProfile);
  return router;
}
