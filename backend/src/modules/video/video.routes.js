import { Router } from 'express';

import { authenticate, authorize } from '../../middlewares/authenticate.js';
import { validateBody, validateParams } from '../../middlewares/validate.js';
import { lessonParams } from '../curriculum/curriculum.schemas.js';
import { createVideoController } from './video.controller.js';
import { emptyUploadBodySchema } from './video.schemas.js';

export function createInstructorVideoRouter({ videoService }) {
  const router = Router();
  const controller = createVideoController({ videoService });
  router.post('/lessons/:lessonId/video-upload',
    authenticate,
    authorize('instructor'),
    validateParams(lessonParams),
    validateBody(emptyUploadBodySchema),
    controller.createUpload);
  return router;
}

export function createVideoWebhookRouter({ videoService }) {
  const router = Router();
  const controller = createVideoController({ videoService });
  router.post('/', controller.webhook);
  return router;
}
