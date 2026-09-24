import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

// Fail closed for cookie-setting and cookie-authenticated operations. Clients
// without browser headers must explicitly send an allowed Origin as well.
export function requireTrustedOrigin(request, response, next) {
  void response;
  const originHeader = request.get('origin');
  const source = originHeader ?? request.get('referer');
  try {
    const parsed = new URL(source);
    const validOrigin = !originHeader || originHeader === parsed.origin;
    if (validOrigin && env.CORS_ORIGINS.includes(parsed.origin)) return next();
  } catch {
    // Missing and malformed sources use the same safe response.
  }
  return next(new ApiError(403, 'REQUEST_ORIGIN_DENIED',
    'A trusted request origin is required'));
}
