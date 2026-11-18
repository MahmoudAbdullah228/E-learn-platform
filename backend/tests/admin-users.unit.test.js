import assert from 'node:assert/strict';
import { test } from 'node:test';

import { adminUsersQuerySchema, userStatusInputSchema } from '../src/modules/adminUsers/adminUsers.schemas.js';
import { decodeAdminUsersCursor, encodeAdminUsersCursor } from '../src/modules/adminUsers/adminUsers.cursor.js';
import { assertUserStatusChange } from '../src/modules/adminUsers/adminUsers.policy.js';
import { toAdminUser } from '../src/modules/adminUsers/adminUsers.presenter.js';

const id = '0123456789abcdef01234567';
const reason = 'A documented account security decision';
const user = { _id: id, createdAt: new Date('2026-11-18T12:00:00.000Z'), name: 'Admin',
  email: 'admin@example.test', roles: ['admin'], status: 'active', instructorStatus: 'none',
  emailVerifiedAt: new Date(), passwordHash: 'private', tokenVersion: 42 };

test('admin user list query is strict, bounded and normalized without coercing nested values', () => {
  assert.deepEqual(adminUsersQuerySchema.parse({}), { limit: 20 });
  assert.deepEqual(adminUsersQuerySchema.parse({ q: '  ALIce@  ', limit: '100' }), { q: 'alice@', limit: 100 });
  for (const input of [{ limit: '0' }, { limit: '101' }, { limit: '-1' }, { limit: '1e2' },
    { limit: ['1'] }, { q: { $ne: '' } }, { q: '' }, { q: 'a\u200Bb' }, { q: ' Alice\n' }, { q: 'x'.repeat(101) },
    { role: 'owner' }, { status: 'deleted' }, { extra: true }]) {
    assert.equal(adminUsersQuerySchema.safeParse(input).success, false);
  }
});

test('status command rejects privilege injection and unsafe revisions or reasons', () => {
  const input = { status: 'suspended', reason, expectedRevision: 0 };
  assert.deepEqual(userStatusInputSchema.parse(input), input);
  for (const patch of [{ roles: ['admin'] }, { email: 'other@example.test' }, { tokenVersion: 0 },
    { status: 'deleted' }, { reason: 'short' }, { reason: `${reason}\n` },
    { expectedRevision: '0' }, { expectedRevision: -1 }, { expectedRevision: 0.5 },
    { expectedRevision: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.equal(userStatusInputSchema.safeParse({ ...input, ...patch }).success, false);
  }
});

test('admin user cursor authenticates its version, page boundary and normalized filters', () => {
  const filters = { q: 'admin', role: 'admin', status: 'active' };
  const cursor = encodeAdminUsersCursor(user, filters);
  assert.equal(adminUsersQuerySchema.safeParse({ cursor }).success, true);
  assert.deepEqual(decodeAdminUsersCursor(cursor, filters), { id, createdAt: user.createdAt });
  assert.deepEqual(decodeAdminUsersCursor(cursor, { ...filters, limit: 50 }), { id, createdAt: user.createdAt });
  assert.equal(decodeAdminUsersCursor(undefined, filters), null);
  const [payload, signature] = cursor.split('.');
  for (const value of [`${payload}.AAAA`, `${payload}A.${signature}`, `${cursor}.extra`,
    `${payload}.${signature}=`, 'x'.repeat(1025), 123]) {
    assert.throws(() => decodeAdminUsersCursor(value, filters), { code: 'INVALID_CURSOR' });
  }
  for (const changed of [{ ...filters, q: 'other' }, { ...filters, status: 'suspended' }, { q: 'admin' }]) {
    assert.throws(() => decodeAdminUsersCursor(cursor, changed), { code: 'INVALID_CURSOR' });
  }
});

test('status policy independently prevents self suspension and loss of the last usable admin', () => {
  assert.throws(() => assertUserStatusChange({ actorId: id, user, status: 'suspended', activeAdminCount: 2 }),
    { code: 'SELF_SUSPENSION_NOT_ALLOWED' });
  assert.throws(() => assertUserStatusChange({ actorId: 'another', user, status: 'suspended', activeAdminCount: 1 }),
    { code: 'LAST_ACTIVE_ADMIN' });
  assert.doesNotThrow(() => assertUserStatusChange({ actorId: 'another', user, status: 'suspended', activeAdminCount: 2 }));
  assert.doesNotThrow(() => assertUserStatusChange({ actorId: id, user, status: 'active', activeAdminCount: 1 }));
});

test('admin presenter uses an allowlist and preserves zero revision for legacy records', () => {
  const result = toAdminUser(user);
  assert.deepEqual(Object.keys(result).sort(), ['id', 'name', 'email', 'roles', 'status', 'instructorStatus', 'revision'].sort());
  assert.equal(result.revision, 0);
  assert.equal('passwordHash' in result, false);
  assert.equal('createdAt' in result, false);
  result.roles.push('student');
  assert.deepEqual(user.roles, ['admin']);
  assert.equal(toAdminUser({ ...user, statusRevision: 7 }, { detail: true }).revision, 7);
});
