import { Router } from 'express';

import { authenticate, authorize } from '../../middlewares/authenticate.js';
import { validateBody, validateParams, validateQuery } from '../../middlewares/validate.js';
import { createInstructorApplicationsController } from './instructorApplications.controller.js';
import {
  applicationIdParamsSchema,
  createInstructorApplicationSchema,
  listInstructorApplicationsQuerySchema,
  reviewInstructorApplicationSchema,
} from './instructorApplications.schemas.js';

function preventSensitiveResponseCaching(request, response, next) {
  void request;
  response.set('Cache-Control', 'no-store');
  next();
}

export function createInstructorApplicationsRouter({ instructorApplicationsService }) {
  const router = Router();
  const controller = createInstructorApplicationsController({ instructorApplicationsService });

  router.use(preventSensitiveResponseCaching, authenticate);
  router.post('/', authorize('student'), validateBody(createInstructorApplicationSchema),
    controller.createApplication);
  router.get('/me', controller.getMyApplication);
  return router;
}

export function createAdminInstructorApplicationsRouter({ instructorApplicationsService }) {
  const router = Router();
  const controller = createInstructorApplicationsController({ instructorApplicationsService });

  router.use(preventSensitiveResponseCaching, authenticate, authorize('admin'));
  router.get('/', validateQuery(listInstructorApplicationsQuerySchema),
    controller.listApplications);
  router.patch('/:applicationId', validateParams(applicationIdParamsSchema),
    validateBody(reviewInstructorApplicationSchema), controller.reviewApplication);
  return router;
}
