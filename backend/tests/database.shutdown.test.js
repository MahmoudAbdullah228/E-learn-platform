import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/db.js';

test('shutdown during a failed connection prevents all further retries', async (t) => {
  const controller = new AbortController();
  const connect = t.mock.method(mongoose, 'connect', async () => {
    controller.abort();
    throw new Error('Database unavailable');
  });
  await assert.rejects(connectDatabase({ signal: controller.signal }), { name: 'AbortError' });
  assert.equal(connect.mock.callCount(), 1);
});

test('shutdown interrupts retry backoff immediately', async (t) => {
  const controller = new AbortController();
  const connect = t.mock.method(mongoose, 'connect', async () => {
    setImmediate(() => controller.abort());
    throw new Error('Database unavailable');
  });
  await assert.rejects(connectDatabase({ signal: controller.signal, retryDelayMs: 60_000 }),
    { name: 'AbortError' });
  assert.equal(connect.mock.callCount(), 1);
});

test('a connection completing after shutdown is closed before returning', async (t) => {
  const controller = new AbortController();
  t.mock.method(mongoose, 'connect', async () => { controller.abort(); });
  const disconnect = t.mock.method(mongoose, 'disconnect', async () => {});
  await assert.rejects(connectDatabase({ signal: controller.signal }), { name: 'AbortError' });
  assert.equal(disconnect.mock.callCount(), 1);
});
