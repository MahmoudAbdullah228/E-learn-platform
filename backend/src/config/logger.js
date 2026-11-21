import pino from 'pino';

import { env } from './env.js';

export function serializeRequest(request) {
  return { id: request.id, method: request.method };
}

export function serializeError(error) {
  const errorType =
    typeof error?.name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name)
      ? error.name : 'UnknownError';
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
