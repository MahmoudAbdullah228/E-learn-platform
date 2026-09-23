import assert from 'node:assert/strict';
import test from 'node:test';

import { closeHttpServer } from '../src/services/shutdown.service.js';

const silentLogger = {
  warn() {},
};

test('closeHttpServer finishes normally when the server closes', async () => {
  const server = {
    close(callback) {
      callback();
    },
    closeAllConnections() {
      assert.fail('normal shutdown must not force-close connections');
    },
  };

  const result = await closeHttpServer(server, { timeoutMs: 50, logger: silentLogger });

  assert.deepEqual(result, { forced: false });
});

test('closeHttpServer force-closes connections after the deadline', async () => {
  let forcedCloseCount = 0;
  const server = {
    close() {},
    closeAllConnections() {
      forcedCloseCount += 1;
    },
  };

  const result = await closeHttpServer(server, { timeoutMs: 10, logger: silentLogger });

  assert.deepEqual(result, { forced: true });
  assert.equal(forcedCloseCount, 1);
});
