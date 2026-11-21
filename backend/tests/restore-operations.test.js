import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

import { assertApplicationDatabase } from '../src/config/db.js';
import { reconcileRestoredPayments } from '../src/modules/operations/restoreReconciliation.service.js';

test('restore review detects a refund issued after backup and cannot initiate a second payment operation', async () => {
  const payment = { _id: 'payment', status: 'succeeded', orderId: 'order', checkoutSessionId: 'checkout',
    paymentIntentId: 'pi_fixture', currency: 'EGP', amountMinor: 100 };
  const data = { payments: [payment], orders: [{ _id: 'order', status: 'paid', currency: 'EGP', amountMinor: 100 }], refunds: [] };
  const database = { databaseName: 'drill_restore', collection(name) {
    const query = { sort: () => query, limit: () => query, toArray: async () => data[name] };
    return { find: () => query, findOne: async () => data[name][0], countDocuments: async () => 1 };
  } };
  const provider = { retrieveCheckoutSession: async () => ({ ...payment, id: 'checkout', orderId: 'order',
    metadataOrderId: 'order', paymentStatus: 'paid', status: 'complete', paymentIntent: {
      id: payment.paymentIntentId, status: 'succeeded', livemode: false, amountMinor: 100,
      amountReceivedMinor: 100, currency: 'EGP', orderId: 'order' } }), scanRefundObservations: async () => [] };
  const check = () => reconcileRestoredPayments({ database, provider, options: {} });
  assert.equal((await check()).matched, 1);
  provider.scanRefundObservations = async () => [{ providerRefundId: 're_after_backup', amountMinor: 100 }];
  const result = await check();
  assert.equal(result.review, 1);
  assert.equal(result.payoutsToCompare, 1);
  assert.equal(result.externalPeriodReviewRequired, true);
  database.databaseName = 'app';
  await assert.rejects(check());
});

test('readiness fails closed on an unreachable replica set with sanitized output', () => {
  const run = spawnSync(process.execPath, ['scripts/finance-operations.js', 'readiness'], {
    cwd: new URL('../', import.meta.url), env: { ...process.env, MONGO_TEST_URI: 'mongodb://127.0.0.1:1/ops_outage_test' },
    encoding: 'utf8', timeout: 15000 });
  assert.equal(run.status, 1);
  assert.doesNotMatch(run.stderr + run.stdout, /mongodb:\/\/|127\.0\.0\.1|MongoServerSelectionError|\bat file:/);
});

test('application and worker database connections reject a recovery namespace', () => {
  assert.throws(() => assertApplicationDatabase('mongodb://localhost:27017/site_restore'), /isolated/);
});
