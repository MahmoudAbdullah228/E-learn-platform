import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import mongoose from 'mongoose';
import { z } from 'zod';
import { reconcileRestoredPayments } from '../src/modules/operations/restoreReconciliation.service.js';

const execute = promisify(execFile);
const { MongoClient, ObjectId, BSON } = mongoose.mongo;
const uri = 'mongodb://127.0.0.1:27018/?replicaSet=elearnLocal';
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
const prefix = 'elearn_drill_' + randomUUID().replaceAll('-', '');
const source = client.db(prefix + '_test'), restored = client.db(prefix + '_restore');
const created = [];
let temporary;

async function manifest(db) {
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const result = {};
  for (const name of collections.map(item => item.name).sort()) {
    const collection = db.collection(name);
    const digest = createHash('sha256');
    let count = 0;
    for await (const doc of collection.find({}, { raw: true }).sort({ _id: 1 })) {
      digest.update(doc); count++;
    }
    const indexes = (await collection.indexes()).sort((a, b) => a.name.localeCompare(b.name));
    result[name] = { count, hash: digest.digest('hex'), indexes: indexes.map(({ name, key, unique }) => ({ name, key, unique })) };
  }
  return result;
}

try {
  z.tuple([]).parse(process.argv.slice(2));
  await client.connect();
  const names = (await client.db('admin').admin().listDatabases({ nameOnly: true })).databases.map(db => db.name);
  if ([source, restored].some(db => names.includes(db.databaseName))) throw new Error('Drill name collision');
  created.push(source, restored);
  const orderId = new ObjectId();
  const checkoutId = 'cs_test_drill', intentId = 'pi_drill';
  await source.collection('orders').insertOne({ _id: orderId, status: 'paid', currency: 'EGP',
    amountMinor: BSON.Long.fromNumber(10000), platformAmountMinor: 2000, instructorAmountMinor: 8000, paidAt: new Date() });
  await source.collection('payments').insertOne({ orderId, checkoutSessionId: checkoutId, paymentIntentId: intentId,
    currency: 'EGP', status: 'succeeded', amountMinor: 10000 });
  await source.collection('webhookevents').createIndex({ provider: 1, eventId: 1 }, { unique: true });
  await source.collection('webhookevents').insertOne({ provider: 'stripe', eventId: 'evt_fixture', status: 'pending' });
  const expected = await manifest(source);
  temporary = await mkdtemp(join(tmpdir(), 'elearn-drill-'));
  const archive = '--archive=' + join(temporary, 'fixture.archive');
  const binary = name => process.env.MONGO_TOOLS_DIR ? join(process.env.MONGO_TOOLS_DIR, name) : name;
  const opts = { windowsHide: true, timeout: 120_000 };
  await execute(binary('mongodump'), ['--uri=' + uri, '--db=' + source.databaseName, archive, '--gzip'], opts);
  const restoreStarted = performance.now();
  await execute(binary('mongorestore'), ['--uri=' + uri, archive, '--gzip', '--stopOnError',
    '--nsInclude=' + source.databaseName + '.*', '--nsFrom=' + source.databaseName + '.*',
    '--nsTo=' + restored.databaseName + '.*'], opts);
  const actual = await manifest(restored);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('Restore mismatch');
  const restoreAndVerifyMs = Math.round(performance.now() - restoreStarted);
  // Model a Stripe refund issued after the recovery point. The adapter exposes reads only.
  const provider = {
    async retrieveCheckoutSession() {
      return { id: checkoutId, orderId: String(orderId), metadataOrderId: String(orderId),
        paymentIntentId: intentId, status: 'complete', paymentStatus: 'paid', currency: 'EGP', amountMinor: 10000,
        paymentIntent: { id: intentId, orderId: String(orderId), status: 'succeeded', livemode: false,
          currency: 'EGP', amountMinor: 10000, amountReceivedMinor: 10000 } };
    },
    async scanRefundObservations() {
      return [{ providerRefundId: 're_drill', paymentIntentId: intentId, amountMinor: 10000,
        currency: 'EGP', providerStatus: 'succeeded' }];
    },
  };
  const reconciliation = await reconcileRestoredPayments({ database: restored, provider, options: {} });
  if (reconciliation.review !== 1 || reconciliation.checked !== 1
      || JSON.stringify(await manifest(restored)) !== JSON.stringify(expected)) throw new Error('Reconciliation mismatch');
  process.stdout.write(JSON.stringify({ restored: true, collections: Object.keys(actual).length,
    documents: Object.values(actual).reduce((sum, row) => sum + row.count, 0), restoreAndVerifyMs, snapshotsAndIndexesMatch: true,
    simulatedPostBackupRefundDetected: true }) + '\n');
} catch {
  process.stderr.write('Restore rehearsal failed. Check the local replica set and MongoDB Database Tools.\n');
  process.exitCode = 1;
} finally {
  try { for (const db of created) await db.dropDatabase(); }
  finally {
    await client.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}
