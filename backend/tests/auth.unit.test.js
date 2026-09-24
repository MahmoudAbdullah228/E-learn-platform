import assert from 'node:assert/strict';
import test from 'node:test';

import express from 'express';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { createAuthRateLimiter } from '../src/middlewares/rateLimiter.js';
import { registerSchema } from '../src/modules/auth/auth.schemas.js';
import {
  createEmailService,
  createSmtpTransportOptions,
} from '../src/services/email.service.js';
import { generateOneTimeToken, hashOneTimeToken } from '../src/utils/oneTimeToken.js';

test('one-time token generation returns random opaque values and stable hashes', () => {
  const firstToken = generateOneTimeToken();
  const secondToken = generateOneTimeToken();

  assert.match(firstToken, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(firstToken, secondToken);
  assert.equal(hashOneTimeToken(firstToken), hashOneTimeToken(firstToken));
  assert.notEqual(hashOneTimeToken(firstToken), firstToken);
});

test('registration validation enforces the bcrypt UTF-8 byte limit', () => {
  const result = registerSchema.safeParse({
    name: 'Student Name',
    email: 'student@example.com',
    password: '😀'.repeat(19),
  });

  assert.equal(result.success, false);
  assert.match(result.error.issues[0].message, /72 UTF-8 bytes/);
});

test('registration validation rejects excessively long passwords before hashing', () => {
  const result = registerSchema.safeParse({
    name: 'Student Name',
    email: 'student@example.com',
    password: 'a'.repeat(129),
  });

  assert.equal(result.success, false);
  assert.match(result.error.issues[0].message, /too long/);
});

test('email service creates a verification link without putting the token in headers', async () => {
  const messages = [];
  const emailService = createEmailService({
    transport: {
      async sendMail(message) {
        messages.push(message);
      },
    },
    fromAddress: 'no-reply@example.test',
    verificationUrl: 'https://app.example.test/verify-email',
  });
  const token = generateOneTimeToken();

  await emailService.sendEmailVerification({
    recipientEmail: 'student@example.test',
    recipientName: '<Student "Example">',
    token,
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, 'student@example.test');
  assert.equal(messages[0].subject.includes(token), false);
  assert.equal(messages[0].html.includes('&lt;Student &quot;Example&quot;&gt;'), true);
  assert.equal(messages[0].html.includes(encodeURIComponent(token)), true);
});

test('auth rate limiter returns the standardized error envelope', async () => {
  const app = express();
  app.get(
    '/limited',
    createAuthRateLimiter({
      limit: 1,
      code: 'TEST_RATE_LIMITED',
      message: 'Try again later',
    }),
    (request_, response) => response.json({ data: {} }),
  );

  await request(app).get('/limited').expect(200);
  const response = await request(app).get('/limited').expect(429);

  assert.deepEqual(response.body, {
    error: {
      code: 'TEST_RATE_LIMITED',
      message: 'Try again later',
      details: [],
    },
  });
});

test('production SMTP options enforce TLS and bounded timeouts', () => {
  const options = createSmtpTransportOptions({
    NODE_ENV: 'production',
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    SMTP_USER: 'mailer',
    SMTP_PASSWORD: 'secret',
    SMTP_CONNECTION_TIMEOUT_MS: 10_000,
    SMTP_GREETING_TIMEOUT_MS: 10_000,
    SMTP_SOCKET_TIMEOUT_MS: 30_000,
  });

  assert.equal(options.requireTLS, true);
  assert.equal(options.connectionTimeout, 10_000);
  assert.equal(options.greetingTimeout, 10_000);
  assert.equal(options.socketTimeout, 30_000);
  assert.equal(options.tls.minVersion, 'TLSv1.2');
});

test('auth routes request isolated shared-store instances by limiter namespace', () => {
  const namespaces = [];

  createApp({
    rateLimitStoreFactory(namespace) {
      namespaces.push(namespace);
      return undefined;
    },
  });

  assert.deepEqual(namespaces, ['register', 'verify-email', 'resend-verification']);
});
