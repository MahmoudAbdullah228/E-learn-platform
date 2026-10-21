import { Router } from 'express';

import { env } from '../../config/env.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { createAuthenticatedRateLimiter, createPublicRateLimiter } from '../../middlewares/rateLimiter.js';
import { validateParams, validateQuery } from '../../middlewares/validate.js';
import { createLearningAccessController } from './learningAccess.controller.js';
import { downloadParamsSchema, learningQuerySchema, playbackParamsSchema } from './learningAccess.schemas.js';

export function createLearningAccessRouter({ service, rateLimitStoreFactory }) {
  const router = Router();
  const controller = createLearningAccessController({ service });
  const authenticatedLimit = createAuthenticatedRateLimiter({ namespace: 'learning-access',
    windowMs: env.LEARNING_ACCESS_RATE_LIMIT_WINDOW_MS, limit: env.LEARNING_ACCESS_RATE_LIMIT_MAX,
    storeFactory: rateLimitStoreFactory });
  const previewLimit = createPublicRateLimiter({ namespace: 'preview',
    windowMs: env.PREVIEW_RATE_LIMIT_WINDOW_MS, limit: env.PREVIEW_RATE_LIMIT_MAX,
    storeFactory: rateLimitStoreFactory });
  const optionalAuthentication = (request, response, next) => request.get('authorization') === undefined
    ? next() : authenticate(request, response, next);
  const limit = (request, response, next) => (request.auth ? authenticatedLimit : previewLimit)(request, response, next);
  router.get('/:lessonId/playback', optionalAuthentication, limit,
    validateParams(playbackParamsSchema), validateQuery(learningQuerySchema), controller.playback);
  router.get('/:lessonId/attachments/:assetId/download', authenticate, limit,
    validateParams(downloadParamsSchema), validateQuery(learningQuerySchema), controller.download);
  return router;
}
