import { z } from 'zod';

import { User } from '../models/User.js';
import { RefreshSession } from '../models/RefreshSession.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/sessionToken.js';

const claimsSchema = z.object({
  sub: z.string().regex(/^[a-f0-9]{24}$/i),
  sid: z.uuid(),
  tokenVersion: z.number().int().nonnegative(),
});

function unauthenticated() {
  return new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required');
}

export async function authenticate(request, response, next) {
  void response;

  const authorization = request.get('authorization');
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  if (!match) return next(unauthenticated());

  let payload;
  try {
    payload = await verifyAccessToken(match[1]);
  } catch {
    return next(unauthenticated());
  }
  if (!claimsSchema.safeParse(payload).success) {
    return next(unauthenticated());
  }

  const user = await User.findOne({
    _id: payload.sub,
    status: 'active',
    emailVerifiedAt: { $ne: null },
  }).select('+tokenVersion');

  if (!user || user.tokenVersion !== payload.tokenVersion) return next(unauthenticated());

  const session = await RefreshSession.exists({
    familyId: payload.sid,
    userId: user.id,
    tokenVersion: user.tokenVersion,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!session) return next(unauthenticated());

  request.auth = Object.freeze({
    userId: user.id,
    roles: [...user.roles],
    tokenVersion: user.tokenVersion,
    familyId: payload.sid,
  });
  return next();
}

export function authorize(...allowedRoles) {
  const allowed = new Set(allowedRoles);

  return function authorizationMiddleware(request, response, next) {
    void response;
    if (!request.auth) return next(unauthenticated());
    if (!request.auth.roles.some((role) => allowed.has(role))) {
      return next(new ApiError(403, 'INSUFFICIENT_PERMISSIONS',
        'You do not have permission to perform this action'));
    }
    return next();
  };
}
