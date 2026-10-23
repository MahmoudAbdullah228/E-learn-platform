import assert from 'node:assert/strict';
import test from 'node:test';

import { pendingUploadCleanupAt } from '../src/services/mediaCleanup.policy.js';

const now = new Date('2026-10-21T12:00:00Z');
const settlementMs = 300_000;

test('pending cleanup waits past intent expiry, provider validity and the cancellation time', () => {
  for (const [expiresOffset, providerOffset] of [[600_000, 3_600_000],
    [3_600_000, 600_000], [-2000, -1000]]) {
    const asset = { expiresAt: new Date(now.getTime() + expiresOffset),
      providerUploadValidUntil: new Date(now.getTime() + providerOffset) };
    assert.equal(pendingUploadCleanupAt(asset, now).getTime(),
      now.getTime() + Math.max(0, expiresOffset, providerOffset) + settlementMs);
  }
});

test('legacy intents without provider validity keep the conservative one-hour fallback', () => {
  const expiresAt = new Date(now.getTime() - 1000);
  assert.equal(pendingUploadCleanupAt({ expiresAt }, now).getTime(),
    expiresAt.getTime() + 3_600_000 + settlementMs);
});
