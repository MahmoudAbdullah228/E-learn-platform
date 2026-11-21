import { Router } from 'express';

import { env } from '../../config/env.js';
import { createAuthenticatedRateLimiter } from '../../middlewares/rateLimiter.js';
import { authenticate, authorize } from '../../middlewares/authenticate.js';
import { noStore } from '../../middlewares/noStore.js';
import { validateBody, validateParams, validateQuery } from '../../middlewares/validate.js';
import { RevisionLesson, RevisionSection } from '../../models/CourseRevision.js';
import { empty, guard, metadata, mediaIntent, page, params, versioned } from './courseRevisions.schemas.js';
import { createLessonSchema, createSectionSchema, orderSchema, updateLessonSchema } from '../curriculum/curriculum.schemas.js';
import { accessCandidate, createCandidate, discardCandidate, editMetadata, reopenCandidate } from './courseRevisions.service.js';
import { handleRevision } from './courseRevisions.controller.js';
import { createCandidateVideo } from './revisionVideo.service.js';
import { candidateMedia } from './revisionMedia.service.js';
import { curriculumEdit, listRevisionChildren } from './revisionCurriculum.service.js';

function revisionLimit(storeFactory, namespace) {
  return createAuthenticatedRateLimiter({ storeFactory, namespace,
    windowMs: env.MEDIA_ACTION_RATE_LIMIT_WINDOW_MS, limit: env.MEDIA_ACTION_RATE_LIMIT_MAX });
}

export function createCourseRevisionsRouter({ videoProvider, mediaProvider, learningAccessService, rateLimitStoreFactory }) {
  const router = Router({ mergeParams: true });
  router.use(noStore, authenticate, authorize('instructor'), revisionLimit(rateLimitStoreFactory, 'course-revision-editor'));
  router.post('/', validateQuery(empty), validateParams(params.pick({ courseId: true })), validateBody(empty.optional()), handleRevision(createCandidate, 201));
  router.get('/:revisionId', validateQuery(empty), validateParams(params), handleRevision(accessCandidate));
  const mutate = (method, path, schema, operation, status = 200) => {
    router[method]('/:revisionId' + path, validateQuery(empty), validateParams(params), validateBody(schema), handleRevision(
      context => accessCandidate(context, operation), status));
  };
  router.post('/:revisionId/lessons/:lessonId/video-upload', validateParams(params), validateQuery(empty), validateBody(guard),
    handleRevision(context => createCandidateVideo(context, videoProvider), 201));
  const media = candidateMedia(mediaProvider);
  mutate('post', '/media/upload-intents', mediaIntent, media.issue, 201);
  mutate('delete', '/media/:assetId', guard, media.remove);
  router.post('/:revisionId/media/:assetId/confirm', validateQuery(empty), validateParams(params), validateBody(guard),
    handleRevision(media.confirm));
  mutate('post', '/reopen', guard, reopenCandidate);
  mutate('post', '/discard', guard, discardCandidate);
  mutate('patch', '', metadata, editMetadata);
  mutate('post', '/sections', versioned(createSectionSchema), curriculumEdit(RevisionSection, 'create'), 201);
  mutate('put', '/sections/order', versioned(orderSchema), curriculumEdit(RevisionSection, 'reorder'));
  mutate('patch', '/sections/:sectionId', versioned(createSectionSchema), curriculumEdit(RevisionSection, 'edit'));
  mutate('delete', '/sections/:sectionId', guard, curriculumEdit(RevisionSection, 'remove'));
  mutate('post', '/sections/:sectionId/lessons', versioned(createLessonSchema), curriculumEdit(RevisionLesson, 'create'), 201);
  mutate('put', '/sections/:sectionId/lessons/order', versioned(orderSchema), curriculumEdit(RevisionLesson, 'reorder'));
  mutate('patch', '/lessons/:lessonId', versioned(updateLessonSchema).refine(value => Object.keys(value).length > 1),
    curriculumEdit(RevisionLesson, 'edit'));
  mutate('delete', '/lessons/:lessonId', guard, curriculumEdit(RevisionLesson, 'remove'));
  for (const [path, model] of [['/sections', RevisionSection], ['/sections/:sectionId/lessons', RevisionLesson]]) {
    router.get('/:revisionId' + path, validateParams(params), validateQuery(page), handleRevision(
      context => accessCandidate(context, null, listRevisionChildren(model))));
  }
  addReviewReads(router, params, learningAccessService);
  return router;
}

function addReviewReads(router, schema, service) {
  for (const [suffix, method] of [['playback', 'playback'], ['attachments/:assetId/download', 'download']]) {
    router.get('/:revisionId/lessons/:lessonId/' + suffix, validateParams(schema), validateQuery(empty),
      handleRevision(service[method]));
  }
}

export function createRevisionReviewReadRouter(service, rateLimitStoreFactory) {
  const router = Router();
  router.use(noStore, authenticate, authorize('admin'), revisionLimit(rateLimitStoreFactory, 'course-revision-review'));
  addReviewReads(router, params.omit({ courseId: true }), service);
  return router;
}
