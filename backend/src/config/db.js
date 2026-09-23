import mongoose from 'mongoose';

import { env } from './env.js';
import { logger } from './logger.js';

const wait = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

function assertSafeTestDatabase(databaseUri) {
  if (env.NODE_ENV !== 'test') {
    return;
  }

  const databaseName = new URL(databaseUri).pathname.slice(1).split('?')[0];

  if (!databaseName.endsWith('_test')) {
    throw new Error('Test database name must end with _test');
  }
}

export async function connectDatabase({ maxRetries = 5, retryDelayMs = 1000 } = {}) {
  assertSafeTestDatabase(env.DATABASE_URI);

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await mongoose.connect(env.DATABASE_URI, { serverSelectionTimeoutMS: 5000 });
      logger.info({ database: mongoose.connection.name }, 'MongoDB connection established');
      return mongoose.connection;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      logger.error(
        { attempt, maxRetries, errorType: error.name },
        'MongoDB connection failed',
      );

      if (isLastAttempt) {
        throw new Error('Unable to connect to MongoDB', { cause: error });
      }

      await wait(retryDelayMs);
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
