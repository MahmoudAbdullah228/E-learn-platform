import { createHash, randomBytes } from 'node:crypto';

export function generateOneTimeToken() {
  return randomBytes(32).toString('base64url');
}

export function hashOneTimeToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
