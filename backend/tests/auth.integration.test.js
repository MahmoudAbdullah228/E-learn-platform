import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { OneTimeToken } from '../src/models/OneTimeToken.js';
import { User } from '../src/models/User.js';
import { VerificationRequest } from '../src/models/VerificationRequest.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createVerificationWorker } from '../src/services/verificationWorker.service.js';
import { hashOneTimeToken } from '../src/utils/oneTimeToken.js';

const deliveredEmails = [];
const emailSender = {
  async sendEmailVerification(message) {
    deliveredEmails.push(message);
  },
};
const app = createApp({ emailSender });

const validRegistration = {
  name: 'New Student',
  email: 'Student@Example.com',
  password: 'correct horse battery staple',
};

before(async () => {
  await connectDatabase({ maxRetries: 1 });
  assert.match(mongoose.connection.name, /_test$/);
  await Promise.all([User.init(), OneTimeToken.init(), VerificationRequest.init()]);
});

beforeEach(async () => {
  deliveredEmails.length = 0;
  await Promise.all([User.deleteMany({}), OneTimeToken.deleteMany({}), VerificationRequest.deleteMany({})]);
});

after(async () => {
  if (mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await disconnectDatabase();
});

test('registration creates only a student and stores a bcrypt password hash', async () => {
  const startedAt = Date.now();
  const response = await request(app)
    .post('/api/v1/auth/register')
    .send(validRegistration)
    .expect(201);

  assert.deepEqual(response.body.data.user.roles, ['student']);
  assert.equal(response.body.data.user.email, 'student@example.com');
  assert.equal(response.body.data.user.emailVerifiedAt, null);
  assert.equal(JSON.stringify(response.body).includes('password'), false);

  const user = await User.findOne({ email: 'student@example.com' }).select('+passwordHash');
  assert.ok(user);
  assert.deepEqual(user.roles, ['student']);
  assert.notEqual(user.passwordHash, validRegistration.password);
  assert.equal(await bcrypt.compare(validRegistration.password, user.passwordHash), true);

  assert.equal(deliveredEmails.length, 1);
  const rawToken = deliveredEmails[0].token;
  const storedToken = await OneTimeToken.findOne({ userId: user.id })
    .select('+tokenHash')
    .lean();
  assert.ok(storedToken);
  assert.notEqual(storedToken.tokenHash, rawToken);
  assert.equal(storedToken.tokenHash, hashOneTimeToken(rawToken));
  assert.equal(storedToken.purpose, 'email_verification');
  assert.equal(storedToken.expiresAt.getTime() >= startedAt + 86_399_000, true);
  assert.equal(storedToken.expiresAt.getTime() <= Date.now() + 86_401_000, true);
  assert.equal('tokenHash' in (await OneTimeToken.findById(storedToken._id).lean()), false);
});

test('registration rejects role injection and does not create an account', async () => {
  const response = await request(app)
    .post('/api/v1/auth/register')
    .send({ ...validRegistration, roles: ['admin'] })
    .expect(400);

  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  assert.equal(await User.countDocuments(), 0);
});

test('duplicate registration returns the standard conflict response', async () => {
  await request(app).post('/api/v1/auth/register').send(validRegistration).expect(201);

  const response = await request(app)
    .post('/api/v1/auth/register')
    .send({ ...validRegistration, email: 'STUDENT@example.com' })
    .expect(409);

  assert.deepEqual(response.body, {
    error: {
      code: 'RESOURCE_ALREADY_EXISTS',
      message: 'A resource with the same unique value already exists',
      details: [],
    },
  });
  assert.equal(await User.countDocuments(), 1);
});

test('email verification consumes the token once and verifies the user', async () => {
  await request(app).post('/api/v1/auth/register').send(validRegistration).expect(201);
  const { token } = deliveredEmails[0];

  const response = await request(app)
    .post('/api/v1/auth/verify-email')
    .send({ token })
    .expect(200);

  assert.deepEqual(response.body.data, { verified: true });
  const user = await User.findOne({ email: 'student@example.com' }).lean();
  const storedToken = await OneTimeToken.findOne({ userId: user._id }).lean();
  assert.ok(user.emailVerifiedAt instanceof Date);
  assert.ok(storedToken.consumedAt instanceof Date);

  const reused = await request(app)
    .post('/api/v1/auth/verify-email')
    .send({ token })
    .expect(400);
  assert.equal(reused.body.error.code, 'INVALID_OR_EXPIRED_VERIFICATION_TOKEN');
});

test('expired verification tokens are rejected without verifying the user', async () => {
  await request(app).post('/api/v1/auth/register').send(validRegistration).expect(201);
  const { token } = deliveredEmails[0];
  await OneTimeToken.updateOne({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });

  const response = await request(app)
    .post('/api/v1/auth/verify-email')
    .send({ token })
    .expect(400);

  assert.equal(response.body.error.code, 'INVALID_OR_EXPIRED_VERIFICATION_TOKEN');
  const user = await User.findOne({ email: 'student@example.com' }).lean();
  assert.equal(user.emailVerifiedAt, null);
});

test('resend rotates the token and returns the same response for unknown accounts', async () => {
  await request(app).post('/api/v1/auth/register').send(validRegistration).expect(201);
  const firstToken = deliveredEmails[0].token;
  const user = await User.findOne({ email: 'student@example.com' });

  const existingResponse = await request(app)
    .post('/api/v1/auth/resend-verification')
    .send({ email: 'STUDENT@example.com' })
    .expect(202);
  await app.locals.verificationWorker.processNext();
  const secondToken = deliveredEmails[1].token;
  assert.notEqual(secondToken, firstToken);
  assert.equal(await OneTimeToken.countDocuments({ userId: user.id }), 1);
  assert.equal(
    (await OneTimeToken.findOne({ userId: user.id }).select('+tokenHash').lean()).tokenHash,
    hashOneTimeToken(secondToken),
  );

  const unknownResponse = await request(app)
    .post('/api/v1/auth/resend-verification')
    .send({ email: 'unknown@example.com' })
    .expect(202);

  assert.deepEqual(unknownResponse.body, existingResponse.body);
  await app.locals.verificationWorker.processNext();
  assert.equal(deliveredEmails.length, 2);
});

test('resend does not send another email after verification', async () => {
  await request(app).post('/api/v1/auth/register').send(validRegistration).expect(201);
  await request(app)
    .post('/api/v1/auth/verify-email')
    .send({ token: deliveredEmails[0].token })
    .expect(200);

  await request(app)
    .post('/api/v1/auth/resend-verification')
    .send({ email: validRegistration.email })
    .expect(202);

  await app.locals.verificationWorker.processNext();
  assert.equal(deliveredEmails.length, 1);
});

test('suspended accounts cannot verify or receive replacement verification emails', async () => {
  await request(app).post('/api/v1/auth/register').send(validRegistration).expect(201);
  const { token } = deliveredEmails[0];
  await User.updateOne(
    { email: 'student@example.com' },
    { $set: { status: 'suspended' } },
  );

  const verificationResponse = await request(app)
    .post('/api/v1/auth/verify-email')
    .send({ token })
    .expect(400);
  assert.equal(
    verificationResponse.body.error.code,
    'INVALID_OR_EXPIRED_VERIFICATION_TOKEN',
  );

  await request(app)
    .post('/api/v1/auth/resend-verification')
    .send({ email: validRegistration.email })
    .expect(202);

  const user = await User.findOne({ email: 'student@example.com' }).lean();
  assert.equal(user.emailVerifiedAt, null);
  await app.locals.verificationWorker.processNext();
  assert.equal(deliveredEmails.length, 1);
});

test('registration returns a safe service error when email delivery fails', async () => {
  const failingApp = createApp({
    emailSender: {
      async sendEmailVerification() {
        throw new Error('smtp://user:secret@mail.internal');
      },
    },
  });

  const response = await request(failingApp)
    .post('/api/v1/auth/register')
    .send(validRegistration)
    .expect(503);

  assert.deepEqual(response.body, {
    error: {
      code: 'EMAIL_DELIVERY_UNAVAILABLE',
      message:
        'Account created, but the verification email could not be sent. Please request a new one',
      details: [],
    },
  });
  assert.equal(JSON.stringify(response.body).includes('secret'), false);
  assert.equal(await User.countDocuments({ email: 'student@example.com' }), 1);
});

test('resend keeps its generic response when email delivery fails', async () => {
  await request(app).post('/api/v1/auth/register').send(validRegistration).expect(201);
  const originalToken = deliveredEmails[0].token;
  const user = await User.findOne({ email: 'student@example.com' });
  const originalTokenRecord = await OneTimeToken.findOne({ userId: user.id })
    .select('+tokenHash')
    .lean();
  const failingApp = createApp({
    emailSender: {
      async sendEmailVerification() {
        throw new Error('provider credentials=secret');
      },
    },
  });

  const response = await request(failingApp)
    .post('/api/v1/auth/resend-verification')
    .send({ email: validRegistration.email })
    .expect(202);

  assert.equal(response.body.message.includes('If the account exists'), true);
  assert.equal(JSON.stringify(response.body).includes('secret'), false);
  await failingApp.locals.verificationWorker.processNext();

  const restoredTokenRecord = await OneTimeToken.findOne({ userId: user.id })
    .select('+tokenHash')
    .lean();
  assert.equal(restoredTokenRecord.tokenHash, originalTokenRecord.tokenHash);
  assert.equal(restoredTokenRecord.expiresAt.getTime(), originalTokenRecord.expiresAt.getTime());

  await request(app)
    .post('/api/v1/auth/verify-email')
    .send({ token: originalToken })
    .expect(200);
});

test('overlapping failed deliveries are serialized and preserve the original token', async () => {
  await request(app).post('/api/v1/auth/register').send(validRegistration).expect(201);
  const originalToken = deliveredEmails[0].token;
  for (let attempt = 0; attempt < 2; attempt++) {
    const pending = [];
    const service = createAuthService({ emailSender: {
      sendEmailVerification() {
        return new Promise((resolve, reject) => pending.push({ resolve, reject }));
      },
    } });
    const outcome = assert.rejects(service.deliverVerificationRequest({ email: 'student@example.com' }), /SMTP unavailable/);
    while (pending.length < 1) await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(service.deliverVerificationRequest({ email: 'student@example.com' }), /busy/);
    pending[0].reject(new Error('SMTP unavailable'));
    await outcome;
    const stored = await OneTimeToken.findOne({}).select('+tokenHash');
    assert.equal(stored.tokenHash, hashOneTimeToken(originalToken));
  }
  await request(app).post('/api/v1/auth/verify-email').send({ token: originalToken }).expect(200);
});

test('failed user update leaves the token retryable', async (t) => {
  await request(app).post('/api/v1/auth/register').send(validRegistration).expect(201);
  const token = deliveredEmails[0].token;
  const update = t.mock.method(User, 'findOneAndUpdate', async () => {
    throw new Error('Simulated database outage');
  });
  await request(app).post('/api/v1/auth/verify-email').send({ token }).expect(500);
  assert.equal((await OneTimeToken.findOne({})).consumedAt, null);
  update.mock.restore();
  await request(app).post('/api/v1/auth/verify-email').send({ token }).expect(200);
});

test('concurrent verification succeeds only once', async () => {
  await request(app).post('/api/v1/auth/register').send(validRegistration).expect(201);
  const token = deliveredEmails[0].token;
  const responses = await Promise.all([0, 1].map(() =>
    request(app).post('/api/v1/auth/verify-email').send({ token })));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 400]);
});

test('token cleanup failure cannot allow replay after successful verification', async (t) => {
  await request(app).post('/api/v1/auth/register').send(validRegistration).expect(201);
  const token = deliveredEmails[0].token;
  const update = t.mock.method(OneTimeToken, 'updateOne', async () => {
    throw new Error('Simulated cleanup outage');
  });
  await request(app).post('/api/v1/auth/verify-email').send({ token }).expect(200);
  update.mock.restore();
  await request(app).post('/api/v1/auth/verify-email').send({ token }).expect(400);
});

test('resend enqueues every account state without waiting for delivery or reading users', async (t) => {
  const find = t.mock.method(User, 'findOne', () => assert.fail('HTTP must not look up accounts'));
  const queuedApp = createApp({ emailSender: {
    sendEmailVerification() { assert.fail('HTTP must not send mail'); },
  } });
  const responses = [];
  for (const email of ['student@example.com', 'unknown@example.com']) {
    responses.push(await request(queuedApp).post('/api/v1/auth/resend-verification')
      .send({ email }).expect(202));
  }
  assert.deepEqual(responses[0].body, responses[1].body);
  assert.equal(await VerificationRequest.countDocuments(), 2);
  find.mock.restore();
});

test('a failed delivery cannot replace a concurrently delivered token', async () => {
  await request(app).post('/api/v1/auth/register').send(validRegistration).expect(201);
  let rejectFailed;
  let enterFailed;
  const entered = new Promise(resolve => { enterFailed = resolve; });
  const failed = createAuthService({ emailSender: { sendEmailVerification() {
    enterFailed();
    return new Promise((resolve, reject) => { rejectFailed = reject; });
  } } });
  const pending = failed.deliverVerificationRequest({ email: 'student@example.com' });
  const rejection = assert.rejects(pending, /Unavailable/);
  await entered;
  const successful = createAuthService({ emailSender });
  await assert.rejects(successful.deliverVerificationRequest({ email: 'student@example.com' }), /busy/);
  rejectFailed(new Error('Unavailable'));
  await rejection;
  await successful.deliverVerificationRequest({ email: 'student@example.com' });
  const delivered = deliveredEmails[1].token;
  await request(app).post('/api/v1/auth/verify-email').send({ token: delivered }).expect(200);
});

test('two workers cannot claim the same queued request while its lease is active', async () => {
  await VerificationRequest.create({ email: 'job@example.com', availableAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000) });
  let release;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const first = createVerificationWorker({ deliver: async () => {
    entered();
    await new Promise(resolve => { release = resolve; });
  } });
  const second = createVerificationWorker({ deliver: async () => assert.fail('Duplicate delivery') });
  const processing = first.processNext();
  await started;
  try { assert.equal(await second.processNext(), false); }
  finally { release(); await processing; }
  assert.equal(await VerificationRequest.countDocuments(), 0);
});

test('queued failures retry with backoff and stop after three attempts', async () => {
  let now = new Date();
  await VerificationRequest.create({ email: 'job@example.com', availableAt: now,
    expiresAt: new Date(now.getTime() + 86_400_000) });
  let calls = 0;
  const worker = createVerificationWorker({ clock: () => now, deliver: async () => {
    calls++;
    throw new Error('Unavailable');
  } });
  for (let i = 0; i < 3; i++) {
    assert.equal(await worker.processNext(), true);
    assert.equal(await worker.processNext(), false);
    now = new Date(now.getTime() + 60_001);
  }
  assert.equal(calls, 3);
  assert.equal(await VerificationRequest.countDocuments(), 0);
});

test('a replacement worker recovers an expired lease but ignores expired jobs', async () => {
  const now = new Date();
  await VerificationRequest.create([
    { email: 'recover@example.com', availableAt: new Date(now.getTime() - 1),
      expiresAt: new Date(now.getTime() + 86_400_000), leaseId: 'abandoned', attempts: 1 },
    { email: 'expired@example.com', availableAt: new Date(now.getTime() - 1000),
      expiresAt: new Date(now.getTime() - 1) },
  ]);
  const recipients = [];
  const worker = createVerificationWorker({ clock: () => now, deliver: async ({ email }) => {
    recipients.push(email);
  } });
  assert.equal(await worker.processNext(), true);
  assert.equal(await worker.processNext(), false);
  assert.deepEqual(recipients, ['recover@example.com']);
});

test('failed activation after SMTP acceptance preserves the old verification link', async (t) => {
  await request(app).post('/api/v1/auth/register').send(validRegistration).expect(201);
  const original = deliveredEmails[0].token;
  const service = createAuthService({ emailSender });
  const update = t.mock.method(OneTimeToken, 'updateOne', async () => {
    throw new Error('Activation unavailable');
  });
  await assert.rejects(service.deliverVerificationRequest({ email: 'student@example.com' }),
    /Activation unavailable/);
  update.mock.restore();
  assert.equal(deliveredEmails.length, 2);
  await request(app).post('/api/v1/auth/verify-email').send({ token: original }).expect(200);
});

test('suspension does not consume a token needed after reactivation', async () => {
  await request(app).post('/api/v1/auth/register').send(validRegistration).expect(201);
  const token = deliveredEmails[0].token;
  await User.updateOne({}, { $set: { status: 'suspended' } });
  await request(app).post('/api/v1/auth/verify-email').send({ token }).expect(400);
  await User.updateOne({}, { $set: { status: 'active' } });
  await request(app).post('/api/v1/auth/verify-email').send({ token }).expect(200);
});

test('concurrent and queued resend requests produce one accepted replacement', async () => {
  await request(app).post('/api/v1/auth/register').send(validRegistration).expect(201);
  const requestedAt = new Date();
  let release;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const first = createAuthService({ emailSender: { async sendEmailVerification(message) {
    deliveredEmails.push(message);
    entered();
    await new Promise(resolve => { release = resolve; });
  } } });
  const second = createAuthService({ emailSender });
  const input = { email: 'student@example.com', requestedAt };
  const pending = first.deliverVerificationRequest(input);
  await started;
  try {
    await assert.rejects(second.deliverVerificationRequest(input), /busy/);
  } finally { release(); await pending; }
  await second.deliverVerificationRequest(input);
  assert.equal(deliveredEmails.length, 2);
  await request(app).post('/api/v1/auth/verify-email')
    .send({ token: deliveredEmails[1].token }).expect(200);
});

test('worker shutdown aborts a stuck delivery at its deadline and retains the job', async () => {
  await VerificationRequest.create({ email: 'job@example.com', availableAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000) });
  let entered;
  let release;
  let signal;
  const started = new Promise(resolve => { entered = resolve; });
  const worker = createVerificationWorker({ shutdownTimeoutMs: 20, deliver: async (input) => {
    signal = input.signal;
    entered();
    await new Promise(resolve => { release = resolve; });
  } });
  worker.start();
  await started;
  await worker.stop();
  assert.equal(signal.aborted, true);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await VerificationRequest.countDocuments(), 1);
  assert.equal(await worker.processNext(), false);
});

test('cancelled or expired issuance cannot activate a late SMTP result', async () => {
  await request(app).post('/api/v1/auth/register').send(validRegistration).expect(201);
  const original = deliveredEmails[0].token;
  const controller = new AbortController();
  const cancelled = createAuthService({ emailSender: { async sendEmailVerification() {
    controller.abort();
  } } });
  await assert.rejects(cancelled.deliverVerificationRequest({
    email: 'student@example.com', signal: controller.signal,
  }), { name: 'AbortError' });
  let now = new Date(Date.now() + 600_001);
  const expired = createAuthService({ clock: () => now, emailSender: {
    async sendEmailVerification() { now = new Date(now.getTime() + 600_001); },
  } });
  await assert.rejects(expired.deliverVerificationRequest({ email: 'student@example.com' }), /lease expired/);
  assert.equal((await OneTimeToken.findOne({}).select('+tokenHash')).tokenHash,
    hashOneTimeToken(original));
});
