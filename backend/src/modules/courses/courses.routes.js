import { Router } from 'express';

import { authenticate, authorize } from '../../middlewares/authenticate.js';
import { validateBody, validateParams, validateQuery } from '../../middlewares/validate.js';
import { createCoursesController } from './courses.controller.js';
import {
  courseIdParamsSchema,
  createCourseSchema,
  listCoursesQuerySchema,
  updateCourseSchema,
} from './courses.schemas.js';

export function createCoursesRouter({ coursesService }) {
  const router = Router();
  const controller = createCoursesController({ coursesService });

  router.use((request, response, next) => {
    void request;
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use(authenticate, authorize('instructor'));
  router.route('/')
    .get(validateQuery(listCoursesQuerySchema), controller.listCourses)
    .post(validateBody(createCourseSchema), controller.createCourse);
  router.route('/:courseId')
    .get(validateParams(courseIdParamsSchema), controller.getCourse)
    .patch(validateParams(courseIdParamsSchema), validateBody(updateCourseSchema),
      controller.updateCourse);

  return router;
}
