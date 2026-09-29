import { Router } from 'express';

import { authenticate, authorize } from '../../middlewares/authenticate.js';
import { validateBody, validateParams } from '../../middlewares/validate.js';
import { createCurriculumController } from './curriculum.controller.js';
import {
  courseParams, courseSectionParams, sectionParams, lessonParams,
  createSectionSchema, updateSectionSchema, createLessonSchema, updateLessonSchema, orderSchema,
} from './curriculum.schemas.js';

export function createCurriculumRouter({ curriculumService }) {
  const router = Router();
  const controller = createCurriculumController({ curriculumService });
  router.use((request, response, next) => {
    void request;
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use(authenticate, authorize('instructor'));
  router.route('/courses/:courseId/sections')
    .all(validateParams(courseParams))
    .get(controller.listSections)
    .post(validateBody(createSectionSchema), controller.createSection);
  router.put('/courses/:courseId/sections/order', validateParams(courseParams),
    validateBody(orderSchema), controller.reorderSections);
  router.route('/courses/:courseId/sections/:sectionId')
    .all(validateParams(courseSectionParams))
    .patch(validateBody(updateSectionSchema), controller.updateSection)
    .delete(controller.deleteSection);
  router.post('/sections/:sectionId/lessons', validateParams(sectionParams),
    validateBody(createLessonSchema), controller.createLesson);
  router.put('/sections/:sectionId/lessons/order', validateParams(sectionParams),
    validateBody(orderSchema), controller.reorderLessons);
  router.route('/lessons/:lessonId')
    .all(validateParams(lessonParams))
    .patch(validateBody(updateLessonSchema), controller.updateLesson)
    .delete(controller.deleteLesson);
  return router;
}
