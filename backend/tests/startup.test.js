import assert from 'node:assert/strict';
import test from 'node:test';

import { startHttpServer } from '../src/services/startup.service.js';

test('startup does not bind a listener when shutdown begins during database connection', async () => {
  let resolveConnection;
  let isShuttingDown = false;
  let disconnectCount = 0;
  let listenCount = 0;
  const connection = new Promise((resolve) => {
    resolveConnection = resolve;
  });

  const startup = startHttpServer({
    connectDatabase: () => connection,
    disconnectDatabase: async () => {
      disconnectCount += 1;
    },
    isShuttingDown: () => isShuttingDown,
    listen: () => {
      listenCount += 1;
      return { listening: true };
    },
  });

  isShuttingDown = true;
  resolveConnection();
  const server = await startup;

  assert.equal(server, null);
  assert.equal(listenCount, 0);
  assert.equal(disconnectCount, 1);
});

test('startup binds only after the database connection succeeds', async () => {
  const expectedServer = { listening: true };
  const server = await startHttpServer({
    connectDatabase: async () => {},
    disconnectDatabase: async () => assert.fail('disconnect should not run'),
    isShuttingDown: () => false,
    listen: () => expectedServer,
  });

  assert.equal(server, expectedServer);
});
