import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { Order } from '../src/models/Order.js';

test('first admin and student order pages use bounded index scans', async t => {
  const connection = await connectDatabase({ maxRetries: 1 });
  try {
    assert.equal(process.env.NODE_ENV, 'test');
    assert.match(connection.name, /_test$/);
    const collection = await connection.db.createCollection('order_plan_' + randomUUID());
    try {
      const students = Array.from({ length: 8 }, () => new mongoose.Types.ObjectId());
      await collection.insertMany(Array.from({ length: 800 }, (_, i) => ({
        studentId: students[i % students.length], createdAt: new Date(1700000000000 + i),
      })));
      for (const [keys] of Order.schema.indexes()) {
        if ('createdAt' in keys) await collection.createIndex(keys);
      }
      for (const filter of [{}, { studentId: students[0] }]) {
        const plan = await collection.find(filter).sort({ createdAt: -1, _id: -1 })
          .limit(20).explain('executionStats');
        const { nReturned, totalDocsExamined, totalKeysExamined } = plan.executionStats;
        t.diagnostic(JSON.stringify({ scope: filter.studentId ? 'student' : 'admin',
          nReturned, totalDocsExamined, totalKeysExamined }));
        assert.equal(nReturned, 20);
        assert.equal(totalDocsExamined, nReturned);
        assert.equal(totalKeysExamined, nReturned);
      }
    } finally {
      await collection.drop();
    }
  } finally {
    await disconnectDatabase();
  }
});
