import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { corsOptions } from './config/cors.js';
import { env } from './config/env.js';
import { logger, serializeRequest } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { docsRouter } from './modules/docs/docs.routes.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { createSessionService } from './modules/auth/session.service.js';
import { createPasswordResetService } from './modules/auth/passwordReset.service.js';
import { createUsersRouter } from './modules/users/users.routes.js';
import { createUsersService } from './modules/users/users.service.js';
import {
  createAdminInstructorApplicationsRouter,
  createInstructorApplicationsRouter,
} from './modules/instructorApplications/instructorApplications.routes.js';
import {
  createInstructorApplicationsService,
} from './modules/instructorApplications/instructorApplications.service.js';
import { emailService } from './services/email.service.js';
import { createAuthEmailWorker } from './services/authEmailWorker.service.js';
import { createCoursesRouter } from './modules/courses/courses.routes.js';
import { createCoursesService } from './modules/courses/courses.service.js';
import { createCurriculumRouter } from './modules/curriculum/curriculum.routes.js';
import { createCurriculumService } from './modules/curriculum/curriculum.service.js';
import {
  createInstructorVideoRouter,
  createVideoWebhookRouter,
} from './modules/video/video.routes.js';
import { createVideoService } from './modules/video/video.service.js';
import { muxVideoProvider } from './services/muxVideo.service.js';
import { createVideoCleanupWorker } from './services/videoCleanupWorker.service.js';
import {
  createInstructorProfileRouter,
  createPublicInstructorsRouter,
} from './modules/instructors/instructors.routes.js';
import { createInstructorsService } from './modules/instructors/instructors.service.js';
import { createMediaRouter } from './modules/media/media.routes.js';
import { createMediaService } from './modules/media/media.service.js';
import { cloudinaryMediaProvider } from './services/cloudinaryMedia.service.js';
import { createMediaCleanupWorker } from './services/mediaCleanupWorker.service.js';
import {
  createAdminCourseReviewRouter, createInstructorCourseReviewRouter,
} from './modules/courseReview/courseReview.routes.js';
import { createCourseReviewService } from './modules/courseReview/courseReview.service.js';
import {
  createAdminCategoriesRouter, createPublicCategoriesRouter,
} from './modules/categories/categories.routes.js';
import { createCategoriesService } from './modules/categories/categories.service.js';
import { createCatalogRouter } from './modules/catalog/catalog.routes.js';
import { createCatalogService } from './modules/catalog/catalog.service.js';
import { createCheckoutRouter } from './modules/checkout/checkout.routes.js';
import { createCheckoutService } from './modules/checkout/checkout.service.js';
import { stripePaymentProvider } from './services/stripePayment.service.js';
import { createPaymentInboxService } from './modules/payments/paymentInbox.service.js';
import { createPaymentWebhookRouter } from './modules/payments/payment.routes.js';
import { createPaymentWebhookWorker } from './services/paymentWebhookWorker.service.js';
import { authenticate } from './middlewares/authenticate.js';
import { noStore } from './middlewares/noStore.js';
import { createAuthenticatedRateLimiter } from './middlewares/rateLimiter.js';
import { createEnrollmentService } from './modules/enrollments/enrollment.service.js';
import { createFreeEnrollmentRouter, createLibraryRouter } from './modules/enrollments/enrollment.routes.js';
import { createOrderService } from './modules/orders/order.service.js';
import { createAdminOrdersRouter, createStudentOrdersRouter } from './modules/orders/order.routes.js';
import { createLearningAccessService } from './modules/learningAccess/learningAccess.service.js';
import { createLearningAccessRouter } from './modules/learningAccess/learningAccess.routes.js';
import { createProgressService } from './modules/progress/progress.service.js';
import { createProgressRouter } from './modules/progress/progress.routes.js';

export function createApp({
  emailSender,
  rateLimitStoreFactory,
  instructorApplicationsService: injectedInstructorApplicationsService,
  instructorsService: injectedInstructorsService,
  videoProvider = muxVideoProvider,
  mediaProvider = cloudinaryMediaProvider,
  paymentProvider = stripePaymentProvider,
} = {}) {
  const application = express();
  const authService = createAuthService({ emailSender: emailSender ?? emailService });
  const passwordResetService = createPasswordResetService({
    emailSender: emailSender ?? emailService,
  });
  const sessionService = createSessionService();
  const usersService = createUsersService({ mediaProvider });
  const instructorApplicationsService = injectedInstructorApplicationsService
    ?? createInstructorApplicationsService();
  const instructorsService = injectedInstructorsService ?? createInstructorsService({ mediaProvider });
  const coursesService = createCoursesService();
  const videoService = createVideoService({ videoProvider });
  const mediaService = createMediaService({ provider: mediaProvider });
  const learningAccessService = createLearningAccessService({ videoProvider, mediaProvider, videoService,
    shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS });
  application.locals.learningAccessService = learningAccessService;
  const categoriesService = createCategoriesService();
  const catalogService = createCatalogService({ mediaProvider });
  const enrollmentService = createEnrollmentService({ mediaProvider });
  const orderService = createOrderService();
  const courseReviewService = createCourseReviewService();
  const checkoutService = createCheckoutService({ provider: paymentProvider,
    shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS });
  application.locals.checkoutService = checkoutService;
  const paymentInbox = createPaymentInboxService({ provider: paymentProvider });
  application.locals.paymentWebhookWorker = createPaymentWebhookWorker({ provider: paymentProvider,
    shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS });
  const deliveryHandlers = Object.freeze({
    email_verification: authService.deliverVerificationRequest,
    password_reset: passwordResetService.deliverResetRequest,
  });
  application.locals.authEmailWorker = createAuthEmailWorker({
    deliver: ({ purpose, ...request }) => {
      const handler = deliveryHandlers[purpose];
      if (!handler) throw new Error('Unsupported authentication email purpose');
      return handler(request);
    },
    shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
  });
  application.locals.videoCleanupWorker = createVideoCleanupWorker({
    videoProvider,
    shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
  });
  application.locals.mediaCleanupWorker = createMediaCleanupWorker({
    provider: mediaProvider, shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
  });

  application.disable('x-powered-by');
  application.set('trust proxy', env.TRUST_PROXY_HOPS);
  application.use(['/api/v1/users/me/courses', '/api/v1/users/me/orders', '/api/v1/admin/orders',
    '/api/v1/courses/:courseId/enroll', '/api/v1/lessons'], noStore);
  application.use(
    pinoHttp({
      logger,
      serializers: {
        req: serializeRequest,
      },
    }),
  );
  application.use(helmet());
  application.use(cors(corsOptions));
  application.use(compression());
  application.use(
    '/api/v1/webhooks/video',
    express.raw({ type: 'application/json', limit: '1mb' }),
    createVideoWebhookRouter({ videoService }),
  );
  application.use('/api/v1/webhooks/stripe',
    express.raw({ type: 'application/json', limit: '1mb', inflate: false }),
    createPaymentWebhookRouter({ inbox: paymentInbox }));
  application.use(express.json({ limit: '1mb' }));

  application.use('/api/v1/health', healthRouter);
  application.use('/api/v1', docsRouter);
  application.use(
    '/api/v1/auth',
    createAuthRouter({
      authService,
      passwordResetService,
      sessionService,
      rateLimitStoreFactory,
    }),
  );
  application.use('/api/v1/users/me/courses', createProgressRouter({ service: createProgressService(),
    rateLimitStoreFactory }));
  application.use(['/api/v1/users/me/courses', '/api/v1/users/me/orders', '/api/v1/admin/orders'],
    noStore, authenticate, createAuthenticatedRateLimiter({ namespace: 'private-read',
      windowMs: env.PRIVATE_READ_RATE_LIMIT_WINDOW_MS, limit: env.PRIVATE_READ_RATE_LIMIT_MAX,
      storeFactory: rateLimitStoreFactory }));
  application.use('/api/v1/users/me/courses', createLibraryRouter({ enrollmentService }));
  application.use('/api/v1/users/me/orders', createStudentOrdersRouter({ orderService }));
  application.use('/api/v1/admin/orders', createAdminOrdersRouter({ orderService }));
  application.use('/api/v1/users', createUsersRouter({ usersService }));
  application.use('/api/v1/lessons', createLearningAccessRouter({ service: learningAccessService,
    rateLimitStoreFactory }));
  application.use('/api/v1/media', createMediaRouter({ mediaService, rateLimitStoreFactory }));
  application.use('/api/v1/categories', createPublicCategoriesRouter({
    categoriesService, rateLimitStoreFactory,
  }));
  application.use('/api/v1/courses', createCheckoutRouter({ checkoutService, rateLimitStoreFactory }));
  application.use('/api/v1/courses', createFreeEnrollmentRouter({ enrollmentService, rateLimitStoreFactory }));
  application.use('/api/v1/courses', createCatalogRouter({ catalogService,
    rateLimitStoreFactory }));
  application.use('/api/v1/admin/categories', createAdminCategoriesRouter({
    categoriesService, rateLimitStoreFactory,
  }));
  application.use('/api/v1/instructor-applications', createInstructorApplicationsRouter({
    instructorApplicationsService,
  }));
  application.use('/api/v1/admin/instructor-applications',
    createAdminInstructorApplicationsRouter({ instructorApplicationsService }));
  application.use('/api/v1/instructors', createPublicInstructorsRouter({
    instructorsService,
    rateLimitStoreFactory,
  }));
  application.use('/api/v1/instructor', createInstructorProfileRouter({
    instructorsService,
    rateLimitStoreFactory,
  }));
  application.use('/api/v1/instructor/courses', createCoursesRouter({ coursesService }));
  application.use('/api/v1/instructor/courses', createInstructorCourseReviewRouter({
    reviewService: courseReviewService, rateLimitStoreFactory,
  }));
  application.use('/api/v1/admin/courses', createAdminCourseReviewRouter({
    reviewService: courseReviewService, rateLimitStoreFactory,
  }));
  application.use('/api/v1/instructor', createCurriculumRouter({
    curriculumService: createCurriculumService(),
  }));
  application.use('/api/v1/instructor', createInstructorVideoRouter({ videoService }));

  application.use(notFoundHandler);
  application.use(errorHandler);

  return application;
}

export const app = createApp();
