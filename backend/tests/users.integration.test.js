import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { User } from '../src/models/User.js';
import { createSessionService } from '../src/modules/auth/session.service.js';

const app = createApp();
const password = 'correct horse battery staple';
let databaseReady = false;

before(async () => {
  await connectDatabase({ maxRetries: 1 });
  assert.match(mongoose.connection.name, /_test$/);
  await Promise.all([User.init(), RefreshSession.init()]);
  databaseReady = true;
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), RefreshSession.deleteMany({})]);
});

after(async () => {
  try {
    if (databaseReady && mongoose.connection.readyState === 1) {
      const results = await Promise.allSettled([User.deleteMany({}), RefreshSession.deleteMany({})]);
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
    }
  } finally {
    await disconnectDatabase();
  }
});

async function createAuthenticatedUser(overrides = {}) {
  const user = await User.create({
    name: 'Profile Student',
    email: 'profile@example.com',
    passwordHash: await bcrypt.hash(password, 10),
    emailVerifiedAt: new Date(),
    ...overrides,
  });
  const session = await createSessionService().login({ email: user.email, password });
  return { user, accessToken: session.accessToken };
}

test('GET /users/me requires a valid authenticated session', async () => {
  const response = await request(app).get('/api/v1/users/me').expect(401);
  assert.equal(response.body.error.code, 'AUTHENTICATION_REQUIRED');
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('GET /users/me returns only the current public profile', async () => {
  const { user, accessToken } = await createAuthenticatedUser();
  const response = await request(app).get('/api/v1/users/me')
    .auth(accessToken, { type: 'bearer' }).expect(200);
  assert.equal(response.headers['cache-control'], 'no-store');

  assert.deepEqual(response.body, { data: { user: {
    id: user.id,
    name: 'Profile Student',
    email: 'profile@example.com',
    roles: ['student'],
    emailVerifiedAt: user.emailVerifiedAt.toISOString(),
  } } });
  for (const secret of ['passwordHash', 'tokenVersion', 'passwordVersion', 'passwordReset']) {
    assert.equal(JSON.stringify(response.body).includes(secret), false);
  }
});

test('PATCH /users/me trims and persists the name only', async () => {
  const { accessToken } = await createAuthenticatedUser();
  const response = await request(app).patch('/api/v1/users/me')
    .auth(accessToken, { type: 'bearer' })
    .send({ name: '  Updated Student  ' }).expect(200);

  assert.equal(response.body.data.user.name, 'Updated Student');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.body.message, 'Profile updated successfully');
  const stored = await User.findOne({ email: 'profile@example.com' });
  assert.equal(stored.name, 'Updated Student');
  assert.deepEqual(stored.roles, ['student']);
  assert.equal(stored.email, 'profile@example.com');
});

test('PATCH /users/me rejects protected and unknown fields without changes', async () => {
  const { accessToken } = await createAuthenticatedUser();
  for (const body of [
    { name: 'Attacker', roles: ['admin'] },
    { name: 'Attacker', email: 'other@example.com' },
    { name: 'Attacker', status: 'suspended' },
    { name: 'Attacker', passwordHash: 'plaintext' },
  ]) {
    const response = await request(app).patch('/api/v1/users/me')
      .auth(accessToken, { type: 'bearer' }).send(body).expect(400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  assert.equal((await User.findOne({ email: 'profile@example.com' })).name, 'Profile Student');
});

test('profile name validation rejects length boundaries and hidden characters', async () => {
  const { accessToken } = await createAuthenticatedUser();
  for (const name of ['A', 'A'.repeat(101), 'Visible\nHidden', 'Visible\u200BHidden']) {
    const response = await request(app).patch('/api/v1/users/me')
      .auth(accessToken, { type: 'bearer' }).send({ name }).expect(400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  }
});

test('suspension after login blocks profile reads and writes', async () => {
  const { user, accessToken } = await createAuthenticatedUser();
  await User.updateOne({ _id: user.id }, { $set: { status: 'suspended' } });

  await request(app).get('/api/v1/users/me')
    .auth(accessToken, { type: 'bearer' }).expect(401);
  await request(app).patch('/api/v1/users/me')
    .auth(accessToken, { type: 'bearer' }).send({ name: 'Blocked Change' }).expect(401);
  assert.equal((await User.findById(user.id)).name, 'Profile Student');
});

test('logout invalidates profile access for that device immediately', async () => {
  const { accessToken } = await createAuthenticatedUser();
  await RefreshSession.updateOne({}, {
    $set: { revokedAt: new Date(), revokedReason: 'logout' },
  });
  await request(app).get('/api/v1/users/me')
    .auth(accessToken, { type: 'bearer' }).expect(401);
});
