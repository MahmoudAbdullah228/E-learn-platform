import mongoose from 'mongoose';

import { createStagingOperationsService,
  parseStagingOperationsArguments } from '../src/services/stagingOperations.service.js';

let connection;
try {
  const input = parseStagingOperationsArguments(process.argv.slice(2));
  if (!input.execute) {
    process.stdout.write('Dry run: no database connection. --execute reads aggregate counts only; '
      + 'use a read-only MongoDB account for the intended environment.\n');
  } else {
    const { env } = await import('../src/config/env.js');
    connection = mongoose.createConnection(env.DATABASE_URI, {
      autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000, socketTimeoutMS: 10000,
    });
    await connection.asPromise();
    const result = await createStagingOperationsService({ database: connection.db }).snapshot();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch {
  process.stderr.write('Staging status failed. Check arguments, configuration and database access; '
    + 'no complete snapshot was produced.\n');
  process.exitCode = 1;
} finally {
  try {
    if (connection) await connection.close();
  } catch {
    process.stderr.write('Staging status database disconnect failed.\n');
    process.exitCode = 1;
  }
}
