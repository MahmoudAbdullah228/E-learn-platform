import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { createPasswordResetService } from '../src/modules/auth/passwordReset.service.js';

let user;
let messages;
let service;
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
before(async () => { await connectDatabase({ maxRetries: 1 }); await User.init(); });
beforeEach(async () => {
  if (user) await User.deleteOne({ _id: user.id });
  user = await User.create({ name: 'Race Test', email: 'race-probe@example.test', passwordHash: 'unused' });
  messages = [];
  service = createPasswordResetService({ emailSender: {
    async sendPasswordReset(message) { messages.push(message); },
  } });
  await service.deliverResetRequest({ email: user.email });
});
after(async () => {
  if (user) await User.deleteOne({ _id: user.id });
  await disconnectDatabase();
});

test('a delayed old reset cannot commit after replacement activation', async (t) => {
  const entered = deferred();
  const release = deferred();
  const original = User.findOneAndUpdate.bind(User);
  t.mock.method(User, 'findOneAndUpdate', (filter, ...rest) => {
    if (!filter['passwordReset.tokenHash']) return original(filter, ...rest);
    return { select: async fields => {
      entered.resolve();
      await release.promise;
      return original(filter, ...rest).select(fields);
    } };
  });
  const oldToken = messages[0].token;
  const pending = assert.rejects(service.resetPassword({ token: oldToken, password: 'new-password-value' }),
    { code: 'INVALID_OR_EXPIRED_PASSWORD_RESET_TOKEN' });
  await entered.promise;
  try {
    await service.deliverResetRequest({ email: user.email, requestedAt: new Date(Date.now() + 1000) });
  } finally { release.resolve(); }
  await pending;
  assert.equal((await User.findById(user.id).select('+passwordVersion')).passwordVersion, 0);
  await service.resetPassword({ token: messages.at(-1).token, password: 'new-password-value' });
});

test('reset during SMTP is retryable and the accepted replacement is usable', async () => {
  const entered = deferred();
  const release = deferred();
  const delayed = createPasswordResetService({ emailSender: {
    async sendPasswordReset(message) {
      messages.push(message); entered.resolve(); await release.promise;
    },
  } });
  const issuance = delayed.deliverResetRequest({ email: user.email, requestedAt: new Date(Date.now() + 1000) });
  await entered.promise;
  try {
    await assert.rejects(service.resetPassword({ token: messages[0].token, password: 'new-password-value' }),
      { code: 'PASSWORD_RESET_IN_PROGRESS' });
  } finally { release.resolve(); }
  await issuance;
  await service.resetPassword({ token: messages.at(-1).token, password: 'new-password-value' });
});

test('SMTP failure releases issuance and preserves the old usable token', async () => {
  const failing = createPasswordResetService({ emailSender: {
    async sendPasswordReset() { throw new Error('SMTP failed'); },
  } });
  await assert.rejects(failing.deliverResetRequest({ email: user.email,
    requestedAt: new Date(Date.now() + 1000) }), /SMTP failed/);
  await service.resetPassword({ token: messages[0].token, password: 'new-password-value' });
});

test('expired issuance cannot reactivate a token after a reset', async () => {
  let now = new Date(Date.now() + 1000);
  const entered = deferred();
  const release = deferred();
  const delayed = createPasswordResetService({ clock: () => now, emailSender: {
    async sendPasswordReset(message) { messages.push(message); entered.resolve(); await release.promise; },
  } });
  const issuance = assert.rejects(delayed.deliverResetRequest({ email: user.email }), /lease expired/);
  await entered.promise;
  now = new Date(now.getTime() + 600_001);
  try {
    await delayed.resetPassword({ token: messages[0].token, password: 'new-password-value' });
  } finally { release.resolve(); }
  await issuance;
  await assert.rejects(delayed.resetPassword({ token: messages.at(-1).token, password: 'other-password-value' }),
    { code: 'INVALID_OR_EXPIRED_PASSWORD_RESET_TOKEN' });
});
