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

export function serializeError(error) {
  const errorType =
    typeof error?.name === 'string' && error.name.length <= 64 ? error.name : 'UnknownError';
  const fields = { errorType };

  if (
    typeof error?.code === 'string' &&
    /^[a-zA-Z0-9_-]{1,64}$/.test(error.code)
  ) {
    fields.errorCode = error.code;
  }

  return fields;
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
