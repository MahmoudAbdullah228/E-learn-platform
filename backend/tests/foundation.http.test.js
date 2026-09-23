import assert from 'node:assert/strict';
import test from 'node:test';

import request from 'supertest';

import { app } from '../src/app.js';
import { serializeError, serializeRequest } from '../src/config/logger.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';

test('GET /api/v1/health returns the success envelope', async () => {
  const response = await request(app).get('/api/v1/health').expect(200);

  assert.equal(response.body.data.status, 'ok');
  assert.equal(Number.isInteger(response.body.data.uptimeSeconds), true);
  assert.equal(response.headers['x-powered-by'], undefined);
});

test('unknown routes return the standard error envelope', async () => {
  const response = await request(app).get('/api/v1/missing').expect(404);

  assert.deepEqual(response.body, {
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: 'Route GET /api/v1/missing was not found',
      details: [],
    },
  });
});

test('malformed JSON returns a safe error without a stack trace', async () => {
  const response = await request(app)
    .post('/api/v1/health')
    .set('Content-Type', 'application/json')
    .send('{invalid')
    .expect(400);

  assert.deepEqual(response.body, {
    error: {
      code: 'INVALID_JSON',
      message: 'Request body contains invalid JSON',
      details: [],
    },
  });
  assert.equal(JSON.stringify(response.body).includes('stack'), false);
});

test('JSON syntax errors use the safe fallback when the parser type is unavailable', () => {
  let statusCode;
  let payload;
  const response = {
    status(value) {
      statusCode = value;
      return this;
    },
    json(value) {
      payload = value;
      return this;
    },
  };
  const error = new SyntaxError('Unexpected token');
  error.status = 400;
  error.body = '{invalid';

  errorHandler(error, { log: { error() {} } }, response, () => {});

  assert.equal(statusCode, 400);
  assert.deepEqual(payload, {
    error: {
      code: 'INVALID_JSON',
      message: 'Request body contains invalid JSON',
      details: [],
    },
  });
});

test('oversized JSON returns 413 with the standard error envelope', async () => {
  const response = await request(app)
    .post('/api/v1/health')
    .send({ value: 'a'.repeat(1024 * 1024) })
    .expect(413);

  assert.deepEqual(response.body, {
    error: {
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body exceeds the allowed size',
      details: [],
    },
  });
});

test('request logging excludes query values and headers', () => {
  const serialized = serializeRequest({
    id: 7,
    method: 'GET',
    url: '/api/v1/health?token=review-secret',
    query: { token: 'review-secret' },
    headers: { authorization: 'Bearer review-secret' },
    remoteAddress: '127.0.0.1',
    remotePort: 1234,
  });

  assert.deepEqual(serialized, {
    id: 7,
    method: 'GET',
    path: '/api/v1/health',
    remoteAddress: '127.0.0.1',
    remotePort: 1234,
  });
  assert.equal(JSON.stringify(serialized).includes('review-secret'), false);
});

test('error logging excludes messages, stacks, and unsafe codes', () => {
  const error = new Error('mongodb://admin:secret@example.test/database');
  error.code = 'ECONNREFUSED';
  const serialized = serializeError(error);

  assert.deepEqual(serialized, {
    errorType: 'Error',
    errorCode: 'ECONNREFUSED',
  });
  assert.equal(JSON.stringify(serialized).includes('secret'), false);

  error.code = 'unsafe code containing credentials=secret';
  assert.deepEqual(serializeError(error), { errorType: 'Error' });
});

test('CORS accepts configured origins with credentials', async () => {
  const response = await request(app)
    .get('/api/v1/health')
    .set('Origin', 'http://localhost:5173')
    .expect(200);

  assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:5173');
  assert.equal(response.headers['access-control-allow-credentials'], 'true');
});

test('CORS rejects unapproved browser origins safely', async () => {
  const response = await request(app)
    .get('/api/v1/health')
    .set('Origin', 'https://untrusted.example')
    .expect(403);

  assert.deepEqual(response.body, {
    error: {
      code: 'CORS_ORIGIN_DENIED',
      message: 'Origin is not allowed',
      details: [],
    },
  });
});

test('unexpected errors are sanitized in every environment', () => {
  let statusCode;
  let payload;
  const response = {
    status(value) {
      statusCode = value;
      return this;
    },
    json(value) {
      payload = value;
      return this;
    },
  };

  errorHandler(
    new Error('database password=secret and internal stack'),
    { log: { error() {} } },
    response,
    () => {},
  );

  assert.equal(statusCode, 500);
  assert.deepEqual(payload, {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      details: [],
    },
  });
});
