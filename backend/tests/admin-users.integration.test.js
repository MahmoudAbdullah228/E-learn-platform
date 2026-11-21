import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';

import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { assertTransactionSupport } from '../src/config/transactions.js';
import { AdminAuditEvent } from '../src/models/AdminAuditEvent.js';
import { AdminSecurityState } from '../src/models/AdminSecurityState.js';
import { Enrollment } from '../src/models/Enrollment.js';
import { EarningEntry } from '../src/models/EarningEntry.js';
import { Order } from '../src/models/Order.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { User } from '../src/models/User.js';
import { createAdminUsersService } from '../src/modules/adminUsers/adminUsers.service.js';
import { createSessionService } from '../src/modules/auth/session.service.js';
import { signAccessToken } from '../src/utils/sessionToken.js';
import { seedAdmin } from '../src/services/seed.service.js';

const password = 'correct horse battery staple';
const reason = 'Documented security review for this account';
const base = '/api/v1/admin/users';
const models = [User, RefreshSession, AdminSecurityState, AdminAuditEvent, Enrollment, Order, EarningEntry];
let ready = false;
let hash;
let app;

before(async () => {
  await connectDatabase({ maxRetries: 1 });
  assert.match(mongoose.connection.name, /_test$/);
  await assertTransactionSupport();
  await Promise.all(models.map(Model => Model.init()));
  hash = await bcrypt.hash(password, 10);
  ready = true;
});
async function clearFixtures() {
  assert.equal(ready && mongoose.connection.readyState === 1, true);
  assert.match(mongoose.connection.name, /_test$/);
  await Promise.all(models.map(Model => Model.collection.deleteMany({})));
}
beforeEach(async () => { await clearFixtures(); app = createApp(); });
after(async () => {
  try { if (ready && mongoose.connection.readyState === 1) await clearFixtures(); }
  finally { await disconnectDatabase(); }
});

async function identity({ roles = ['student'], status = 'active', email, name = 'Account User',
  emailVerifiedAt = new Date(), ...metadata } = {}) {
  const user = await User.create({ name, email: email ?? `${randomUUID()}@example.test`,
    passwordHash: hash, roles, status, emailVerifiedAt, ...metadata });
  if (status !== 'active' || !emailVerifiedAt) return { user };
  const login = await createSessionService().login({ email: user.email, password });
  const device = await RefreshSession.findOne({ userId: user.id });
  return { user, accessToken: login.accessToken, refreshToken: login.refreshToken,
    auth: { userId: user.id, roles, tokenVersion: user.tokenVersion, familyId: device.familyId } };
}
const admin = options => identity({ roles: ['admin'], ...options });
const authRequest = (method, path, actor) => request(app)[method](path).auth(actor.accessToken, { type: 'bearer' });
const setStatus = (actor, target, status = 'suspended', expectedRevision = 0) =>
  authRequest('patch', `${base}/${target.user.id}/status`, actor).send({ status, reason, expectedRevision });

test('admin user endpoints enforce current admin authentication and no-store on all error paths', async () => {
  for (const [method, path] of [['get', base], ['get', `${base}/${new mongoose.Types.ObjectId()}`],
    ['patch', `${base}/${new mongoose.Types.ObjectId()}/status`]]) {
    const anonymous = await request(app)[method](path).send({});
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.headers['cache-control'], 'no-store');
  }
  const student = await identity();
  const corsDenied = await request(app).get(base).set('Origin', 'https://unapproved.example.test').expect(403);
  assert.equal(corsDenied.headers['cache-control'], 'no-store');
  assert.equal((await authRequest('get', base, student)).status, 403);
  const actor = await admin();
  await User.updateOne({ _id: actor.user.id }, { $set: { roles: ['student'] } });
  assert.equal((await authRequest('get', base, actor)).status, 403);
  await assert.rejects(createAdminUsersService().changeStatus({ auth: actor.auth, userId: student.user.id,
    input: { status: 'suspended', reason, expectedRevision: 0 } }), { code: 'INSUFFICIENT_PERMISSIONS' });
  assert.equal(await AdminAuditEvent.countDocuments(), 0);
});

test('safe admin reads expose no password, reset, token, private profile or internal guard fields', async () => {
  const actor = await admin();
  const target = await identity({ passwordReset: { tokenHash: 'private-reset', expiresAt: new Date() },
    instructorProfile: { bio: 'A'.repeat(70), expertise: 'Backend', links: [] } });
  const detail = await authRequest('get', `${base}/${target.user.id}`, actor).expect(200);
  assert.deepEqual(Object.keys(detail.body.data.user).sort(), ['id', 'name', 'email', 'roles', 'status',
    'instructorStatus', 'revision', 'createdAt', 'updatedAt'].sort());
  assert.equal(detail.body.data.user.revision, 0);
  assert.equal(detail.headers['cache-control'], 'no-store');
  const list = await authRequest('get', base, actor).expect(200);
  assert.equal(list.body.data.users.length, 2);
  for (const item of list.body.data.users) {
    assert.deepEqual(Object.keys(item).sort(), ['id', 'name', 'email', 'roles', 'status', 'instructorStatus', 'revision'].sort());
  }
  await authRequest('get', `${base}/${new mongoose.Types.ObjectId()}`, actor).expect(404);
});

test('list uses literal case-insensitive prefixes, safe role/status filters and stable filter-bound cursors', async () => {
  const actor = await admin({ name: 'Operator' });
  const a = await identity({ name: 'Alice First', email: 'alice1@example.test', roles: ['student', 'instructor'] });
  const b = await identity({ name: 'ALICE Second', email: 'alice2@example.test', roles: ['student', 'instructor'] });
  await identity({ name: 'Alice Suspended', status: 'suspended', roles: ['instructor'] });
  await identity({ name: 'Literal .* user' });
  const tie = new Date('2026-11-01T00:00:00.000Z');
  await User.collection.updateMany({ _id: { $in: [a.user._id, b.user._id] } }, { $set: { createdAt: tie } });
  const filters = { q: ' ALICE ', role: 'instructor', status: 'active', limit: '1' };
  const first = await authRequest('get', base, actor).query(filters).expect(200);
  assert.equal(first.body.data.users.length, 1);
  assert.equal(first.body.data.pagination.hasMore, true);
  const cursor = first.body.data.pagination.nextCursor;
  const second = await authRequest('get', base, actor).query({ ...filters, cursor }).expect(200);
  assert.equal(second.body.data.pagination.hasMore, false);
  assert.equal(second.body.data.pagination.nextCursor, null);
  assert.deepEqual(new Set([first.body.data.users[0].id, second.body.data.users[0].id]), new Set([a.user.id, b.user.id]));
  await authRequest('get', base, actor).query({ ...filters, status: 'suspended', cursor }).expect(400);
  await authRequest('get', base, actor).query({ ...filters, cursor: `${cursor.slice(0, -4)}AAAA` }).expect(400);
  const regex = await authRequest('get', base, actor).query({ q: '.*' }).expect(200);
  assert.deepEqual(regex.body.data.users, []);
  const literal = await authRequest('get', base, actor).query({ q: 'literal .*' }).expect(200);
  assert.equal(literal.body.data.users.length, 1);
});

test('strict HTTP validation rejects injection, unsafe revisions, malformed ids, queries and JSON', async () => {
  const actor = await admin();
  const target = await identity();
  for (const query of ['?limit=101', '?limit=0', '?q[$ne]=x', '?role=owner', '?q=x&q=y', '?extra=x']) {
    const result = await authRequest('get', `${base}${query}`, actor).expect(400);
    assert.equal(result.body.error.code, 'VALIDATION_ERROR');
    assert.equal(result.headers['cache-control'], 'no-store');
  }
  for (const patch of [{ roles: ['admin'] }, { tokenVersion: 0 }, { expectedRevision: '0' },
    { reason: 'short' }, { reason: 'Hidden\u200B characters in reason' }, { status: 'deleted' }]) {
    await authRequest('patch', `${base}/${target.user.id}/status`, actor)
      .send({ status: 'suspended', reason, expectedRevision: 0, ...patch }).expect(400);
  }
  await authRequest('get', `${base}/not-an-id`, actor).expect(400);
  await authRequest('get', `${base}/${target.user.id}?extra=x`, actor).expect(400);
  const malformed = await authRequest('patch', `${base}/${target.user.id}/status`, actor)
    .set('Content-Type', 'application/json').send('{broken').expect(400);
  assert.equal(malformed.headers['cache-control'], 'no-store');
  assert.equal(await AdminAuditEvent.countDocuments(), 0);
  assert.equal((await User.findById(target.user.id)).status, 'active');
});

test('suspension atomically advances status/token versions, revokes all devices and records minimal audit', async () => {
  const actor = await admin();
  const target = await identity({ roles: ['student', 'instructor'] });
  await createSessionService().login({ email: target.user.email, password });
  const response = await setStatus(actor, target).expect(200);
  assert.equal(response.body.data.user.status, 'suspended');
  assert.equal(response.body.data.user.revision, 1);
  const stored = await User.findById(target.user.id).select('+tokenVersion +statusChangedBy +statusChangedAt');
  assert.equal(stored.tokenVersion, 1);
  assert.equal(String(stored.statusChangedBy), actor.user.id);
  assert.ok(stored.statusChangedAt instanceof Date);
  assert.deepEqual(stored.roles, ['student', 'instructor']);
  const devices = await RefreshSession.find({ userId: target.user.id });
  assert.equal(devices.length, 2);
  assert.ok(devices.every(device => device.revokedAt && device.revokedReason === 'account_suspended'));
  const audit = await AdminAuditEvent.findOne({ action: 'user.status_changed' });
  assert.equal(String(audit.actorId), actor.user.id);
  assert.equal(String(audit.targetId), target.user.id);
  assert.equal(audit.fromStatus, 'active');
  assert.equal(audit.toStatus, 'suspended');
  assert.equal(audit.reason, reason);
  await authRequest('get', '/api/v1/users/me', target).expect(401);
  await assert.rejects(createSessionService().login({ email: target.user.email, password }), { code: 'ACCOUNT_SUSPENDED' });
  await assert.rejects(createSessionService().refresh({ refreshToken: target.refreshToken }), { code: 'INVALID_REFRESH_TOKEN' });
});

test('reactivation preserves history but never revives old access/refresh sessions or delayed old-version login', async () => {
  const actor = await admin();
  const target = await identity();
  const courseId = new mongoose.Types.ObjectId();
  const enrollment = await Enrollment.create({ studentId: target.user.id, courseId, status: 'active', enrolledAt: new Date() });
  const order = await Order.create({ studentId: target.user.id, courseId, instructorId: actor.user.id,
    courseTitleSnapshot: 'History remains', amountMinor: 1000, currency: 'EGP', commissionBps: 2000,
    platformAmountMinor: 200, instructorAmountMinor: 800, status: 'paid', paidAt: new Date(), expiresAt: new Date() });
  await EarningEntry.create({ instructorId: actor.user.id, orderId: order.id, type: 'sale', amountMinor: 800, currency: 'EGP' });
  await setStatus(actor, target).expect(200);
  const result = await setStatus(actor, target, 'active', 1).expect(200);
  assert.equal(result.body.data.user.revision, 2);
  await authRequest('get', '/api/v1/users/me', target).expect(401);
  await assert.rejects(createSessionService().refresh({ refreshToken: target.refreshToken }), { code: 'INVALID_REFRESH_TOKEN' });
  const familyId = randomUUID();
  await RefreshSession.create({ userId: target.user.id, familyId, tokenHash: randomUUID(), tokenVersion: 0,
    expiresAt: new Date(Date.now() + 86400_000) });
  const delayedToken = await signAccessToken({ userId: target.user.id, roles: ['student'], tokenVersion: 0, familyId });
  await request(app).get('/api/v1/users/me').auth(delayedToken, { type: 'bearer' }).expect(401);
  const fresh = await createSessionService().login({ email: target.user.email, password });
  await request(app).get('/api/v1/users/me').auth(fresh.accessToken, { type: 'bearer' }).expect(200);
  assert.ok(await Enrollment.exists({ _id: enrollment.id }));
  assert.equal((await Order.findById(order.id)).status, 'paid');
  assert.equal((await EarningEntry.findOne({ orderId: order.id })).amountMinor, 800);
  assert.equal(await AdminAuditEvent.countDocuments({ targetId: target.user.id }), 2);
});

test('no-op is explicit without duplicate audit/version changes and stale revisions cannot overwrite newer decisions', async () => {
  const actor = await admin();
  const target = await identity();
  const noop = await setStatus(actor, target, 'active', 0).expect(200);
  assert.match(noop.body.message, /already/);
  assert.equal(noop.body.data.user.revision, 0);
  assert.equal(await AdminAuditEvent.countDocuments(), 0);
  assert.equal(await RefreshSession.countDocuments({ userId: target.user.id, revokedAt: null }), 1);
  await setStatus(actor, target).expect(200);
  const stale = await setStatus(actor, target).expect(409);
  assert.equal(stale.body.error.code, 'STATE_CONFLICT');
  await setStatus(actor, target, 'suspended', 1).expect(200);
  assert.equal(await AdminAuditEvent.countDocuments(), 1);
  assert.equal((await User.findById(target.user.id).select('+tokenVersion')).tokenVersion, 1);
});

test('self suspension is forbidden even when another active admin exists', async () => {
  const actor = await admin();
  await admin();
  const result = await setStatus(actor, actor).expect(409);
  assert.equal(result.body.error.code, 'SELF_SUSPENSION_NOT_ALLOWED');
  assert.equal((await User.findById(actor.user.id)).status, 'active');
  assert.equal(await AdminAuditEvent.countDocuments(), 0);
});

test('concurrent cross-suspensions from independent service instances preserve a usable administrator', async () => {
  const one = await admin();
  const two = await admin();
  const outcomes = await Promise.allSettled([
    createAdminUsersService().changeStatus({ auth: one.auth, userId: two.user.id,
      input: { status: 'suspended', reason, expectedRevision: 0 } }),
    createAdminUsersService().changeStatus({ auth: two.auth, userId: one.user.id,
      input: { status: 'suspended', reason, expectedRevision: 0 } }),
  ]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'AUTHENTICATION_REQUIRED');
  assert.equal(await User.countDocuments({ roles: 'admin', status: 'active', emailVerifiedAt: { $ne: null } }), 1);
  assert.equal(await AdminAuditEvent.countDocuments(), 1);
  assert.equal(await AdminSecurityState.countDocuments(), 1);
});

test('competing status decisions allow one revision winner and preserve atomic audit/session state', async () => {
  const actor = await admin();
  const other = await admin();
  const target = await identity();
  const outcomes = await Promise.allSettled([actor, other].map(operator =>
    createAdminUsersService().changeStatus({ auth: operator.auth, userId: target.user.id,
      input: { status: 'suspended', reason, expectedRevision: 0 } })));
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'STATE_CONFLICT');
  assert.equal(await AdminAuditEvent.countDocuments(), 1);
  assert.equal((await User.findById(target.user.id).select('+tokenVersion')).tokenVersion, 1);
});

test('audit failure rolls back status, all session revocations, versions and the security guard', async t => {
  const actor = await admin();
  const target = await identity();
  const failure = t.mock.method(AdminAuditEvent, 'insertMany', async () => { throw new Error('sensitive provider failure'); });
  try {
    const result = await setStatus(actor, target).expect(500);
    assert.deepEqual(result.body, { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred', details: [] } });
    assert.equal(result.headers['cache-control'], 'no-store');
  } finally { failure.mock.restore(); }
  const user = await User.findById(target.user.id).select('+tokenVersion +statusRevision');
  assert.equal(user.status, 'active');
  assert.equal(user.tokenVersion, 0);
  assert.equal(user.statusRevision, 0);
  assert.equal(await RefreshSession.countDocuments({ userId: target.user.id, revokedAt: null }), 1);
  assert.equal((await AdminSecurityState.findOne()).revision, 0);
});

test('service rejects stale identity, revoked/expired devices and a forged role snapshot inside the transaction', async () => {
  const actor = await admin();
  const target = await identity();
  const change = auth => createAdminUsersService().changeStatus({ auth, userId: target.user.id,
    input: { status: 'suspended', reason, expectedRevision: 0 } });
  await assert.rejects(change({ ...target.auth, roles: ['admin'] }), { code: 'INSUFFICIENT_PERMISSIONS' });
  await assert.rejects(change({ ...actor.auth, tokenVersion: 1 }), { code: 'AUTHENTICATION_REQUIRED' });
  await RefreshSession.updateOne({ familyId: actor.auth.familyId }, { $set: { revokedAt: new Date() } });
  await assert.rejects(change(actor.auth), { code: 'AUTHENTICATION_REQUIRED' });
  await RefreshSession.updateOne({ familyId: actor.auth.familyId }, { $set: { revokedAt: null, expiresAt: new Date(0) } });
  await assert.rejects(change(actor.auth), { code: 'AUTHENTICATION_REQUIRED' });
  assert.equal(await AdminAuditEvent.countDocuments(), 0);
  assert.equal((await User.findById(target.user.id)).status, 'active');
});

test('session revocation failure aborts suspension before audit and leaves existing sessions usable', async t => {
  const actor = await admin();
  const target = await identity();
  const failure = t.mock.method(RefreshSession, 'updateMany', async () => { throw new Error('session write failure'); });
  try {
    await assert.rejects(createAdminUsersService().changeStatus({ auth: actor.auth, userId: target.user.id,
      input: { status: 'suspended', reason, expectedRevision: 0 } }), /session write failure/);
  } finally { failure.mock.restore(); }
  assert.equal((await User.findById(target.user.id)).status, 'active');
  assert.equal(await AdminAuditEvent.countDocuments(), 0);
  assert.equal(await RefreshSession.countDocuments({ userId: target.user.id, revokedAt: null }), 1);
  await authRequest('get', '/api/v1/users/me', target).expect(200);
});

test('legacy missing status revision begins at zero, and unverified targets stay unverified after reactivation', async () => {
  const actor = await admin();
  const target = await identity({ emailVerifiedAt: null });
  await User.collection.updateOne({ _id: target.user._id }, { $unset: { statusRevision: '' } });
  assert.equal((await authRequest('get', `${base}/${target.user.id}`, actor).expect(200)).body.data.user.revision, 0);
  await setStatus(actor, target).expect(200);
  await setStatus(actor, target, 'active', 1).expect(200);
  assert.equal((await User.findById(target.user.id)).emailVerifiedAt, null);
  await assert.rejects(createSessionService().login({ email: target.user.email, password }), { code: 'EMAIL_NOT_VERIFIED' });
});

test('admin bootstrap cannot undo suspension or revive old sessions when rotating an active admin password', async () => {
  const actor = await admin();
  const target = await admin({ roles: ['admin', 'student'] });
  await setStatus(actor, target).expect(200);
  await assert.rejects(seedAdmin({ name: 'Bootstrap', email: target.user.email, password }), /reactivate a suspended admin/);
  assert.equal((await User.findById(target.user.id)).status, 'suspended');
  await setStatus(actor, target, 'active', 1).expect(200);
  const fresh = await createSessionService().login({ email: target.user.email, password });
  const nextPassword = 'another strong bootstrap password';
  const result = await seedAdmin({ name: 'Bootstrap Updated', email: target.user.email, password: nextPassword });
  assert.equal(result.created, false);
  assert.deepEqual(result.admin.roles, ['admin', 'student']);
  const stored = await User.findById(target.user.id).select('+tokenVersion +passwordVersion +statusRevision');
  assert.equal(stored.tokenVersion, 3);
  assert.equal(stored.passwordVersion, 1);
  assert.equal(stored.statusRevision, 2);
  await request(app).get('/api/v1/users/me').auth(fresh.accessToken, { type: 'bearer' }).expect(401);
  await assert.rejects(createSessionService().refresh({ refreshToken: fresh.refreshToken }), { code: 'INVALID_REFRESH_TOKEN' });
  assert.ok((await createSessionService().login({ email: target.user.email, password: nextPassword })).accessToken);
});

test('unknown users, invalid clocks and exhausted revisions fail without partial writes', async () => {
  const actor = await admin();
  const target = await identity();
  const input = { status: 'suspended', reason, expectedRevision: 0 };
  await assert.rejects(createAdminUsersService().changeStatus({ auth: actor.auth,
    userId: String(new mongoose.Types.ObjectId()), input }), { code: 'USER_NOT_FOUND' });
  await assert.rejects(createAdminUsersService({ clock: () => new Date(NaN) }).changeStatus({ auth: actor.auth,
    userId: target.user.id, input }), TypeError);
  await User.updateOne({ _id: target.user.id }, { $set: { tokenVersion: Number.MAX_SAFE_INTEGER } });
  await assert.rejects(createAdminUsersService().changeStatus({ auth: actor.auth, userId: target.user.id, input }),
    { code: 'SECURITY_STATE_REQUIRES_REVIEW' });
  assert.equal(await AdminAuditEvent.countDocuments(), 0);
  assert.equal((await User.findById(target.user.id)).status, 'active');
});

test('admin user read and write quotas are user-wide across ids and fail closed when the store fails', async () => {
  const actor = await admin();
  const target = await identity();
  const stores = [];
  const counts = new Map();
  app = createApp({ rateLimitStoreFactory: namespace => {
    if (!namespace.startsWith('admin-users-')) return undefined;
    stores.push(namespace);
    return { localKeys: true, async increment(key) {
      const count = (counts.get(namespace) ?? 0) + 1;
      counts.set(namespace, count);
      assert.equal(key, actor.user.id);
      if (namespace.endsWith('write')) throw new Error('private store unavailable');
      return { totalHits: count === 1 ? 1 : 10000, resetTime: new Date(Date.now() + 60_000) };
    }, async decrement() {}, async resetKey() {} };
  } });
  await authRequest('get', base, actor).expect(200);
  const limited = await authRequest('get', `${base}/${target.user.id}`, actor).expect(429);
  assert.ok(limited.headers['retry-after']);
  assert.equal(limited.headers['cache-control'], 'no-store');
  const failed = await setStatus(actor, target).expect(503);
  assert.equal(failed.body.error.code, 'RATE_LIMIT_UNAVAILABLE');
  assert.equal(await AdminAuditEvent.countDocuments(), 0);
  assert.deepEqual(stores.sort(), ['admin-users-read', 'admin-users-write']);
});
