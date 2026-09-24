import { rateLimit } from 'express-rate-limit';

import { env } from '../config/env.js';

function createRateLimitHandler(code, message) {
  return function rateLimitHandler(request, response) {
    void request;

    response.status(429).json({
      error: {
        code,
        message,
        details: [],
      },
    });
  };
}

export function createAuthRateLimiter({ limit, code, message, store }) {
  return rateLimit({
    windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: createRateLimitHandler(code, message),
    store,
  });
}

export function createAuthRateLimiters({ storeFactory } = {}) {
  return Object.freeze({
    register: createAuthRateLimiter({
      limit: env.REGISTER_RATE_LIMIT_MAX,
      code: 'REGISTRATION_RATE_LIMITED',
      message: 'Too many registration attempts. Please try again later',
      store: storeFactory?.('register'),
    }),
    verifyEmail: createAuthRateLimiter({
      limit: env.VERIFY_RATE_LIMIT_MAX,
      code: 'EMAIL_VERIFICATION_RATE_LIMITED',
      message: 'Too many email verification attempts. Please try again later',
      store: storeFactory?.('verify-email'),
    }),
    resendVerification: createAuthRateLimiter({
      limit: env.RESEND_RATE_LIMIT_MAX,
      code: 'VERIFICATION_RESEND_RATE_LIMITED',
      message: 'Too many verification email requests. Please try again later',
      store: storeFactory?.('resend-verification'),
    }),
    login: createAuthRateLimiter({
      limit: env.LOGIN_RATE_LIMIT_MAX,
      code: 'LOGIN_RATE_LIMITED',
      message: 'Too many sign-in attempts. Please try again later',
      store: storeFactory?.('login'),
    }),
    refresh: createAuthRateLimiter({
      limit: env.REFRESH_RATE_LIMIT_MAX,
      code: 'REFRESH_RATE_LIMITED',
      message: 'Too many session refresh attempts. Please try again later',
      store: storeFactory?.('refresh'),
    }),
  });
}
