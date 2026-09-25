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
import { emailService } from './services/email.service.js';
import { createAuthEmailWorker } from './services/authEmailWorker.service.js';

export function createApp({ emailSender, rateLimitStoreFactory } = {}) {
  const application = express();
  const authService = createAuthService({ emailSender: emailSender ?? emailService });
  const passwordResetService = createPasswordResetService({
    emailSender: emailSender ?? emailService,
  });
  const sessionService = createSessionService();
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

  application.disable('x-powered-by');
  application.set('trust proxy', env.TRUST_PROXY_HOPS);
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

  application.use(notFoundHandler);
  application.use(errorHandler);

  return application;
}

export const app = createApp();
