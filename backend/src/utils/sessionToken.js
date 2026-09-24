import { createHmac, randomBytes, randomUUID } from 'node:crypto';

import { SignJWT, jwtVerify } from 'jose';

import { env } from '../config/env.js';

const accessTokenKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export function generateRefreshToken() {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token) {
  return createHmac('sha256', env.REFRESH_TOKEN_PEPPER).update(token).digest('hex');
}

export async function signAccessToken({ userId, roles, tokenVersion, familyId }, options = {}) {
  const expiresInSeconds = options.expiresInSeconds ?? env.ACCESS_TOKEN_TTL_SECONDS;

  return new SignJWT({ roles: [...roles], tokenVersion, sid: familyId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .sign(accessTokenKey);
}

export async function verifyAccessToken(token) {
  const { payload } = await jwtVerify(token, accessTokenKey, {
    algorithms: ['HS256'],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    requiredClaims: ['sub', 'sid', 'iat', 'exp', 'jti', 'tokenVersion'],
  });

  return payload;
}
