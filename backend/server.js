import { app } from './src/app.js';
import { connectDatabase, disconnectDatabase } from './src/config/db.js';
import { env } from './src/config/env.js';
import { assertTransactionSupport } from './src/config/transactions.js';
import { InstructorApplication } from './src/models/InstructorApplication.js';
import { Course } from './src/models/Course.js';
import { CourseReviewEvent } from './src/models/CourseReviewEvent.js';
import { Section } from './src/models/Section.js';
import { Lesson } from './src/models/Lesson.js';
import { VideoCleanupJob } from './src/models/VideoCleanupJob.js';
import { VideoAssetState } from './src/models/VideoAssetState.js';
import { VideoPlaybackLease } from './src/models/VideoPlaybackLease.js';
import { MediaAsset } from './src/models/MediaAsset.js';
import { MediaCleanupJob } from './src/models/MediaCleanupJob.js';
import { Order } from './src/models/Order.js';
import { Payment } from './src/models/Payment.js';
import { Enrollment } from './src/models/Enrollment.js';
import { LessonProgress } from './src/models/LessonProgress.js';
import { EarningEntry } from './src/models/EarningEntry.js';
import { WebhookEvent } from './src/models/WebhookEvent.js';
import { logger, serializeError } from './src/config/logger.js';
import { closeHttpServer } from './src/services/shutdown.service.js';
import { startHttpServer } from './src/services/startup.service.js';

let httpServer;
let isShuttingDown = false;
const startupController = new AbortController();

async function startServer() {
  httpServer = await startHttpServer({
    connectDatabase,
    prepareDatabase: async () => {
      await assertTransactionSupport();
      await Promise.all([
        InstructorApplication.init(), Course.init(), CourseReviewEvent.init(),
        Section.init(), Lesson.init(),
        VideoCleanupJob.init(), VideoAssetState.init(), VideoPlaybackLease.init(),
        MediaAsset.init(), MediaCleanupJob.init(),
        Order.init(), Payment.init(), Enrollment.init(), LessonProgress.init(), EarningEntry.init(), WebhookEvent.init(),
      ]);
    },
    signal: startupController.signal,
    disconnectDatabase,
    isShuttingDown: () => isShuttingDown,
    listen: () =>
      app.listen(env.PORT, () => {
        logger.info({ port: env.PORT }, 'API server listening');
      }),
  });
  if (httpServer && !isShuttingDown) {
    app.locals.authEmailWorker.start();
    app.locals.videoCleanupWorker.start();
    app.locals.mediaCleanupWorker.start();
    app.locals.paymentWebhookWorker.start();
  }
}

async function shutdown(signal, exitCode = 0) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  const learningAccessStopped = app.locals.learningAccessService.stop();
  startupController.abort();
  logger.info({ signal }, 'Graceful shutdown started');
  const workerStopped = app.locals.authEmailWorker.stop();
  const videoCleanupStopped = app.locals.videoCleanupWorker.stop();
  const mediaCleanupStopped = app.locals.mediaCleanupWorker.stop();
  const checkoutStopped = app.locals.checkoutService.stop();
  const paymentWorkerStopped = app.locals.paymentWebhookWorker.stop();

  await closeHttpServer(httpServer, {
    timeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    logger,
  });

  await Promise.all([workerStopped, videoCleanupStopped, mediaCleanupStopped, checkoutStopped,
    paymentWorkerStopped, learningAccessStopped]);
  await disconnectDatabase();
  process.exitCode = exitCode;
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.once('unhandledRejection', (error) => {
  logger.fatal(serializeError(error), 'Unhandled promise rejection');
  void shutdown('unhandledRejection', 1);
});

process.once('uncaughtException', (error) => {
  logger.fatal(serializeError(error), 'Uncaught exception');
  void shutdown('uncaughtException', 1);
});

startServer().catch((error) => {
  logger.fatal(serializeError(error), 'API startup failed');
  void shutdown('startupFailure', 1);
});
