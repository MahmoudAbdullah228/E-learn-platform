import { Router } from 'express';

import { env } from '../../config/env.js';
import { authenticate, authorize } from '../../middlewares/authenticate.js';
import { createAuthenticatedRateLimiter } from '../../middlewares/rateLimiter.js';
import { validateBody, validateParams, validateQuery } from '../../middlewares/validate.js';
import { createCourseReviewController } from './courseReview.controller.js';
import {
  adminCourseListQuerySchema, emptyReviewBodySchema, reviewCourseParamsSchema,
  reviewDecisionSchema,
} from './courseReview.schemas.js';

function noStore(request, response, next) {
  void request;
  response.set('Cache-Control', 'no-store');
  next();
}

export function createInstructorCourseReviewRouter({ reviewService, rateLimitStoreFactory }) {
  const router = Router();
  const controller = createCourseReviewController({ reviewService });
  const limit = createAuthenticatedRateLimiter({
    namespace: 'course-review', windowMs: env.COURSE_REVIEW_RATE_LIMIT_WINDOW_MS,
    limit: env.COURSE_REVIEW_RATE_LIMIT_MAX, storeFactory: rateLimitStoreFactory,
  });
  router.use(noStore, authenticate, authorize('instructor'));
  router.post('/:courseId/submit-review', limit, validateParams(reviewCourseParamsSchema),
    validateBody(emptyReviewBodySchema), controller.submit);
  router.post('/:courseId/reopen', limit, validateParams(reviewCourseParamsSchema),
    validateBody(emptyReviewBodySchema), controller.reopen);
  return router;
}

export function createAdminCourseReviewRouter({ reviewService, rateLimitStoreFactory }) {
  const router = Router();
  const controller = createCourseReviewController({ reviewService });
  const limit = createAuthenticatedRateLimiter({
    namespace: 'admin-course-review', windowMs: env.ADMIN_WRITE_RATE_LIMIT_WINDOW_MS,
    limit: env.ADMIN_WRITE_RATE_LIMIT_MAX, storeFactory: rateLimitStoreFactory,
  });
  router.use(noStore, authenticate, authorize('admin'));
  router.get('/', validateQuery(adminCourseListQuerySchema), controller.list);
  router.get('/:courseId', validateParams(reviewCourseParamsSchema), controller.get);
  router.patch('/:courseId/review', limit, validateParams(reviewCourseParamsSchema),
    validateBody(reviewDecisionSchema), controller.review);
  return router;
}
