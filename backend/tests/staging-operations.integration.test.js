import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { createStagingOperationsService } from '../src/services/stagingOperations.service.js';

test('operational aggregates count actual Mongo records without changing them', async () => {
  const prefix = `staging_status_${randomUUID().replaceAll('-', '')}_`;
  let database;
  const names = ['webhookevents', 'payments', 'mediacleanupjobs', 'videocleanupjobs'];
  try {
    await connectDatabase({ maxRetries: 1 });
    assert.match(mongoose.connection.name, /_test$/);
    database = mongoose.connection.db;
    const now = new Date('2026-10-04T12:00:00Z');
    const old = new Date(now - 300_000);
    await database.collection(prefix + 'webhookevents').insertMany([
      { status: 'pending', createdAt: old, payload: 'private' },
      { status: 'processing', createdAt: now },
      { status: 'processed', createdAt: old },
    ]);
    await database.collection(prefix + 'payments').insertOne({ status: 'failed', createdAt: old });
    await database.collection(prefix + 'mediacleanupjobs').insertMany([
      { availableAt: old, exhaustedAt: null },
      { availableAt: new Date(now.getTime() + 1000), exhaustedAt: null },
      { availableAt: old, exhaustedAt: old },
    ]);
    const scopedDatabase = { collection: name => database.collection(prefix + name) };
    const before = await Promise.all(names.map(name => scopedDatabase.collection(name).find({}).toArray()));
    const result = await createStagingOperationsService({ database: scopedDatabase, clock: () => now }).snapshot();
    assert.deepEqual(result.webhooks.pending, { count: 1, oldestAgeSeconds: 300 });
    assert.deepEqual(result.webhooks.processing, { count: 1, oldestAgeSeconds: 0 });
    assert.deepEqual(result.webhooks.failed, { count: 0, oldestAgeSeconds: null });
    assert.deepEqual(result.payments.failed, { count: 1, oldestAgeSeconds: 300 });
    assert.deepEqual(result.mediaCleanup, { queued: 2, due: 1, exhausted: 1 });
    assert.deepEqual(result.videoCleanup, { queued: 0, due: 0, exhausted: 0 });
    const after = await Promise.all(names.map(name => scopedDatabase.collection(name).find({}).toArray()));
    assert.deepEqual(after, before);
  } finally {
    try {
      if (database) {
        for (const name of names) {
          await database.collection(prefix + name).drop().catch(error => {
            if (error.code !== 26) throw error;
          });
        }
      }
    } finally { await disconnectDatabase(); }
  }
});
