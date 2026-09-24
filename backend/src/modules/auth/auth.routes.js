import { Router } from 'express';

import { createAuthRateLimiters } from '../../middlewares/rateLimiter.js';
import { validateBody } from '../../middlewares/validate.js';
import { createAuthController } from './auth.controller.js';
import {
  registerSchema,
  resendVerificationSchema,
  verifyEmailSchema,
} from './auth.schemas.js';

export function createAuthRouter({ authService, rateLimitStoreFactory }) {
  const router = Router();
  const controller = createAuthController(authService);
  const rateLimiters = createAuthRateLimiters({ storeFactory: rateLimitStoreFactory });

  router.post(
    '/register',
    rateLimiters.register,
    validateBody(registerSchema),
    controller.register,
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
