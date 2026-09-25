import { Router } from 'express';

import { createAuthRateLimiters } from '../../middlewares/rateLimiter.js';
import { validateBody } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireTrustedOrigin } from '../../middlewares/trustedOrigin.js';
import { createAuthController } from './auth.controller.js';
import {
  registerSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  resendVerificationSchema,
  verifyEmailSchema,
} from './auth.schemas.js';

export function createAuthRouter({
  authService,
  passwordResetService,
  sessionService,
  rateLimitStoreFactory,
}) {
  const router = Router();
  const controller = createAuthController({ authService, passwordResetService, sessionService });
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
  router.post('/logout', requireTrustedOrigin, rateLimiters.logout, controller.logout);
  router.post('/logout-all', rateLimiters.logoutAll, authenticate, controller.logoutAll);
  router.post(
    '/forgot-password',
    rateLimiters.forgotPassword,
    validateBody(forgotPasswordSchema),
    controller.forgotPassword,
  );
  router.post(
    '/reset-password',
    rateLimiters.resetPassword,
    validateBody(resetPasswordSchema),
    controller.resetPassword,
  );
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
