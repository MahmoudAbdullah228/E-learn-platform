import mongoose from 'mongoose';
import { setTimeout as wait } from 'node:timers/promises';

import { env } from './env.js';
import { logger, serializeError } from './logger.js';

function normalizeMongoDatabaseIdentity(databaseUri) {
  try {
    const url = new URL(databaseUri);
    const hostname = url.hostname.toLowerCase() === 'localhost' ? '127.0.0.1' : url.hostname;
    const port = url.port || (url.protocol === 'mongodb:' ? '27017' : '');
    const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, '')).toLowerCase();

    return `${url.protocol}//${hostname}:${port}/${databaseName}`;
  } catch {
    return databaseUri.trim().toLowerCase().replace(/[?#].*$/, '');
  }
}

function assertSafeTestDatabase(databaseUri) {
  if (env.NODE_ENV !== 'test') {
    return;
  }

  const databaseName = new URL(databaseUri).pathname.slice(1).split('?')[0];

  if (!databaseName.endsWith('_test')) {
    throw new Error('Test database name must end with _test');
  }

  if (
    normalizeMongoDatabaseIdentity(databaseUri) ===
    normalizeMongoDatabaseIdentity(env.MONGO_URI)
  ) {
    throw new Error('Test database must be different from MONGO_URI');
  }
}

export async function connectDatabase({ maxRetries = 5, retryDelayMs = 1000, signal } = {}) {
  assertSafeTestDatabase(env.DATABASE_URI);

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    signal?.throwIfAborted();
    try {
      await mongoose.connect(env.DATABASE_URI, { serverSelectionTimeoutMS: 5000 });
      if (signal?.aborted) {
        await mongoose.disconnect();
        signal.throwIfAborted();
      }
      logger.info({ database: mongoose.connection.name }, 'MongoDB connection established');
      return mongoose.connection;
    } catch (error) {
      signal?.throwIfAborted();
      const isLastAttempt = attempt === maxRetries;
      logger.error({ attempt, maxRetries, ...serializeError(error) }, 'MongoDB connection failed');

      if (isLastAttempt) {
        throw new Error('Unable to connect to MongoDB', { cause: error });
      }

      await wait(retryDelayMs, undefined, { signal });
    }
  }

  throw new Error('Unable to connect to MongoDB');
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('MongoDB connection closed');
  }
}
