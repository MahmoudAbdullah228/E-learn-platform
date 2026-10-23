import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createStagingOperationsService,
  parseStagingOperationsArguments, stagingOperationsSchema } from '../src/services/stagingOperations.service.js';

const now = new Date('2026-10-04T12:00:00Z');

function fixture(rows = {}) {
  const queries = [];
  const database = { collection(name) {
    return { aggregate(pipeline, options) {
      queries.push({ name, pipeline, options });
      return { async toArray() { return rows[name] ?? []; } };
    } };
  } };
  return { database, queries };
}

test('staging status arguments are strict, opt-in and Zod validated', () => {
  assert.deepEqual(parseStagingOperationsArguments([]), { execute: false });
  assert.deepEqual(parseStagingOperationsArguments(['--execute']), { execute: true });
  for (const args of [['--apply'], ['--execute', '--execute'], ['--execute', 'value']]) {
    assert.throws(() => parseStagingOperationsArguments(args));
  }
  assert.equal(stagingOperationsSchema.safeParse({ execute: 'true' }).success, false);
  assert.equal(stagingOperationsSchema.safeParse({ execute: true, uri: 'private' }).success, false);
});

test('empty staging status is explicit counts, not a readiness claim', async () => {
  const { database, queries } = fixture();
  const result = await createStagingOperationsService({ database, clock: () => now }).snapshot();
  assert.deepEqual(result.webhooks.pending, { count: 0, oldestAgeSeconds: null });
  assert.deepEqual(result.mediaCleanup, { queued: 0, due: 0, exhausted: 0 });
  assert.equal(result.observedAt, now.toISOString());
  assert.equal(Object.hasOwn(result, 'ready'), false);
  assert.equal(queries.length, 4);
  for (const query of queries) {
    assert.equal(query.options.maxTimeMS, 5000);
    assert.ok(query.pipeline.every(stage => !('$out' in stage) && !('$merge' in stage)));
  }
});

test('staging status reports ages and only allowlisted aggregate fields', async () => {
  const { database } = fixture({
    webhookevents: [{ _id: 'pending', count: 2, oldestAt: new Date(now - 120_000), payload: 'secret' }],
    payments: [{ _id: 'failed', count: 1, oldestAt: new Date(now.getTime() + 1000), email: 'secret' }],
    mediacleanupjobs: [{ queued: 4, due: 1, exhausted: 2, resourceId: 'secret' }],
  });
  const result = await createStagingOperationsService({ database, clock: () => now }).snapshot();
  assert.deepEqual(result.webhooks.pending, { count: 2, oldestAgeSeconds: 120 });
  assert.deepEqual(result.payments.failed, { count: 1, oldestAgeSeconds: 0 });
  assert.deepEqual(result.mediaCleanup, { queued: 4, due: 1, exhausted: 2 });
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('a failed database query never returns a partial successful snapshot', async () => {
  const database = { collection() { return { aggregate() {
    return { toArray: async () => { throw new Error('provider-secret'); } };
  } }; } };
  await assert.rejects(createStagingOperationsService({ database }).snapshot());
});

test('staging CLI dry run makes no connection even with an unreachable database', () => {
  const child = spawnSync(process.execPath, ['scripts/staging-status.js'], {
    cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 10000,
    env: { ...process.env, MONGO_TEST_URI: 'mongodb://127.0.0.1:1/staging_status_test' },
  });
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /Dry run: no database connection/);
});

test('staging CLI rejects unknown arguments without exposing them', () => {
  const child = spawnSync(process.execPath, ['scripts/staging-status.js', '--secret-value'], {
    cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 10000,
  });
  assert.equal(child.status, 1);
  assert.equal(child.stderr.includes('--secret-value'), false);
  assert.equal(child.stderr.includes('Error:'), false);
});

test('staging CLI sanitizes invalid configuration without stack traces or secret values', () => {
  const child = spawnSync(process.execPath, ['scripts/staging-status.js', '--execute'], {
    cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 10000,
    env: { ...process.env, JWT_ACCESS_SECRET: 'private-secret' },
  });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /Staging status failed/);
  assert.equal(child.stderr.includes('private-secret'), false);
  assert.equal(child.stderr.includes('Error:'), false);
  assert.equal(child.stdout, '');
});
