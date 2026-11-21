import { parseArgs } from 'node:util';
import mongoose from 'mongoose';
import { z } from 'zod';

import { assertApplicationDatabase, mongoDatabaseName } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { assertTransactionSupport } from '../src/config/transactions.js';
import { checkFinancialData, financialIndexes } from '../src/modules/operations/financialPreflight.service.js';
import { migrationOptions, pageOptions } from '../src/modules/operations/operations.schemas.js';
import { migrateSales } from '../src/modules/operations/saleMigration.service.js';
import { reconcileRestoredPayments } from '../src/modules/operations/restoreReconciliation.service.js';
import { stripePaymentProvider } from '../src/services/stripePayment.service.js';

try {
  const command = z.enum(['migrate', 'readiness', 'restore-check', 'preflight', 'indexes']).parse(process.argv[2]);
  const { values } = parseArgs({ args: process.argv.slice(3), options: {
    apply: { type: 'boolean' }, limit: { type: 'string' }, after: { type: 'string' },
  } });
  const schema = command === 'migrate' ? migrationOptions : command === 'restore-check' ? pageOptions
    : command === 'indexes' ? z.strictObject({ apply: z.boolean().default(false) }) : z.strictObject({});
  const options = schema.parse(values);
  const uri = command === 'restore-check' ? z.string().min(1).parse(process.env.RESTORE_MONGO_URI) : env.DATABASE_URI;
  if (command === 'restore-check') {
    const name = mongoDatabaseName(uri);
    if (!/^[a-z0-9_]+_restore$/.test(name) || [env.MONGO_URI, env.MONGO_TEST_URI]
      .filter(Boolean).some(value => mongoDatabaseName(value).toLowerCase() === name)) {
      throw new Error('Use a separate recovery database');
    }
  } else assertApplicationDatabase(uri);
  // Opening a connection for diagnostics must never build indexes before preflight.
  await mongoose.connect(uri, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 30_000 });
  await assertTransactionSupport();
  const database = mongoose.connection.db;
  let report;
  if (command === 'restore-check') {
    report = await reconcileRestoredPayments({ database, provider: stripePaymentProvider, options });
  } else if (command === 'preflight') {
    report = await checkFinancialData();
  } else if (command === 'indexes') {
    report = await financialIndexes(options);
  } else if (command === 'migrate') {
    report = await migrateSales(options);
  } else {
    await mongoose.connection.transaction(session => database.collection('orders').findOne({},
      { session, projection: { _id: 1 }, maxTimeMS: 5000 }), { readConcern: { level: 'snapshot' } });
    const hello = await database.admin().command({ hello: 1 });
    report = { writablePrimary: hello.isWritablePrimary === true, snapshotRead: true };
  }
  process.stdout.write(JSON.stringify(report) + '\n');
  if (report.blocked || report.review || Number(report.orphans) > 0 || report.writablePrimary === false) process.exitCode = 2;
} catch {
  process.stderr.write('Operation incomplete. Verify arguments, isolated database, replica set and provider access.\n');
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
