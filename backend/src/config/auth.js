import { env } from './env.js';

export const REFRESH_COOKIE_NAME = 'refresh_token';

export function createRefreshCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/v1/auth',
    expires: expiresAt,
  };
}

export const clearRefreshCookieOptions = Object.freeze({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/v1/auth',
});
