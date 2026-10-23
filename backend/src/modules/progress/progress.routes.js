import { Router } from 'express';

import { env } from '../../config/env.js';
import { authenticate, authorize } from '../../middlewares/authenticate.js';
import { createAuthenticatedRateLimiter } from '../../middlewares/rateLimiter.js';
import { validateBody, validateParams, validateQuery } from '../../middlewares/validate.js';
import { createProgressController } from './progress.controller.js';
import { completionBodySchema, courseProgressParamsSchema, lastLessonBodySchema,
  lessonProgressParamsSchema, progressQuerySchema } from './progress.schemas.js';

export function createProgressRouter({ service, rateLimitStoreFactory }) {
  const router = Router();
  const controller = createProgressController({ service });
  const limit = createAuthenticatedRateLimiter({ namespace: 'learning-progress',
    windowMs: env.LEARNING_PROGRESS_RATE_LIMIT_WINDOW_MS, limit: env.LEARNING_PROGRESS_RATE_LIMIT_MAX,
    storeFactory: rateLimitStoreFactory });
  const policy = [authenticate, authorize('student'), limit, validateQuery(progressQuerySchema)];
  router.put('/:courseId/lessons/:lessonId/progress', ...policy, validateParams(lessonProgressParamsSchema),
    validateBody(completionBodySchema), controller.setCompletion);
  router.put('/:courseId/last-lesson', ...policy, validateParams(courseProgressParamsSchema),
    validateBody(lastLessonBodySchema), controller.setLastLesson);
  return router;
}
