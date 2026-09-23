import pino from 'pino';

import { env } from './env.js';

export function serializeRequest(request) {
  const requestUrl = typeof request.url === 'string' ? request.url : '';
  const queryStart = requestUrl.indexOf('?');
  const path = queryStart === -1 ? requestUrl : requestUrl.slice(0, queryStart);

  return {
    id: request.id,
    method: request.method,
    path,
    remoteAddress: request.remoteAddress,
    remotePort: request.remotePort,
  };
}

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'password',
      '*.password',
      'passwordHash',
      '*.passwordHash',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers.set-cookie',
    ],
    censor: '[REDACTED]',
  },
  base: undefined,
});
