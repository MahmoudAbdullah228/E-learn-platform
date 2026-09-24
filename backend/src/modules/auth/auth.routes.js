import { Router } from 'express';

import { createAuthRateLimiters } from '../../middlewares/rateLimiter.js';
import { validateBody } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireTrustedOrigin } from '../../middlewares/trustedOrigin.js';
import { createAuthController } from './auth.controller.js';
import {
  registerSchema,
  loginSchema,
  resendVerificationSchema,
  verifyEmailSchema,
} from './auth.schemas.js';

export function createAuthRouter({ authService, sessionService, rateLimitStoreFactory }) {
  const router = Router();
  const controller = createAuthController({ authService, sessionService });
  const rateLimiters = createAuthRateLimiters({ storeFactory: rateLimitStoreFactory });

  router.post(
    '/register',
    rateLimiters.register,
    validateBody(registerSchema),
    controller.register,
  );
  router.post('/login', requireTrustedOrigin, rateLimiters.login,
    validateBody(loginSchema), controller.login);
  router.post('/refresh', requireTrustedOrigin, rateLimiters.refresh, controller.refresh);
  router.post('/logout', requireTrustedOrigin, controller.logout);
  router.post('/logout-all', authenticate, controller.logoutAll);
  router.post(
    '/verify-email',
    rateLimiters.verifyEmail,
    validateBody(verifyEmailSchema),
    controller.verifyEmail,
  );
  router.post(
    '/resend-verification',
    rateLimiters.resendVerification,
    validateBody(resendVerificationSchema),
    controller.resendEmailVerification,
  );

  return router;
}
