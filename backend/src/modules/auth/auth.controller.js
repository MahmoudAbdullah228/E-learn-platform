import { parseCookie } from 'cookie';

import {
  clearRefreshCookieOptions,
  createRefreshCookieOptions,
  REFRESH_COOKIE_NAME,
} from '../../config/auth.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { refreshTokenSchema } from './auth.schemas.js';

function readRefreshToken(request, { required = true } = {}) {
  let token;
  try {
    token = parseCookie(request.get('cookie') ?? '')[REFRESH_COOKIE_NAME];
  } catch {
    token = undefined;
  }
  const result = refreshTokenSchema.safeParse(token);
  if (!result.success && required) {
    throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Refresh session is invalid or expired');
  }
  return result.success ? result.data : undefined;
}

function setRefreshCookie(response, token, expiresAt) {
  response.cookie(REFRESH_COOKIE_NAME, token, createRefreshCookieOptions(expiresAt));
}

export function createAuthController({ authService, sessionService }) {
  return Object.freeze({
    async register(request, response) {
      const user = await authService.register(request.validatedBody);

      response.status(201).json({
        data: { user },
        message: 'Registration successful. Check your email to verify your account',
      });
    },

    async verifyEmail(request, response) {
      const result = await authService.verifyEmail(request.validatedBody);

      response.status(200).json({
        data: result,
        message: 'Email address verified successfully',
      });
    },

    async resendEmailVerification(request, response) {
      await authService.resendEmailVerification(request.validatedBody);

      response.status(202).json({
        data: {},
        message: 'If the account exists and still needs verification, a verification email will be sent',
      });
    },

    async login(request, response) {
      response.set('Cache-Control', 'no-store');
      const result = await sessionService.login(request.validatedBody);
      setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
      response.status(200).json({
        data: {
          accessToken: result.accessToken,
          expiresInSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
          user: result.user,
        },
        message: 'Signed in successfully',
      });
    },

    async refresh(request, response) {
      response.set('Cache-Control', 'no-store');
      const result = await sessionService.refresh({ refreshToken: readRefreshToken(request) });
      setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
      response.status(200).json({
        data: {
          accessToken: result.accessToken,
          expiresInSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
        },
        message: 'Session refreshed successfully',
      });
    },

    async logout(request, response) {
      await sessionService.logout({
        refreshToken: readRefreshToken(request, { required: false }),
      });
      response.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions);
      response.status(200).json({ data: {}, message: 'Signed out successfully' });
    },

    async logoutAll(request, response) {
      await sessionService.logoutAll({ userId: request.auth.userId });
      response.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions);
      response.status(200).json({ data: {}, message: 'Signed out from all devices successfully' });
    },
  });
}
