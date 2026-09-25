import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

// Each node:test file runs in its own process. Load the app only after setting
// small limits, without changing the environment used by the database suites.
for (const key of [
  'REGISTER', 'VERIFY', 'RESEND', 'LOGIN', 'REFRESH', 'FORGOT_PASSWORD',
  'RESET_PASSWORD', 'LOGOUT', 'LOGOUT_ALL',
]) process.env[`${key}_RATE_LIMIT_MAX`] = '2';
const { createApp } = await import('../src/app.js');

for (const [path, status, code] of [
  ['register', 400, 'REGISTRATION_RATE_LIMITED'],
  ['verify-email', 400, 'EMAIL_VERIFICATION_RATE_LIMITED'],
  ['resend-verification', 400, 'VERIFICATION_RESEND_RATE_LIMITED'],
  ['login', 400, 'LOGIN_RATE_LIMITED'],
  ['refresh', 401, 'REFRESH_RATE_LIMITED'],
  ['forgot-password', 400, 'PASSWORD_RESET_REQUEST_RATE_LIMITED'],
  ['reset-password', 400, 'PASSWORD_RESET_RATE_LIMITED'],
  ['logout', 200, 'LOGOUT_RATE_LIMITED'],
  ['logout-all', 401, 'LOGOUT_ALL_RATE_LIMITED'],
]) {
  test(`${path} enforces its HTTP limit with safe errors and retry headers`, async () => {
    const app = createApp();
    const send = () => request(app).post(`/api/v1/auth/${path}`)
      .set('Origin', 'http://localhost:5173').send({});
    await send().expect(status);
    await send().expect(status);
    const blocked = await send().expect(429);
    assert.equal(blocked.body.error.code, code);
    assert.deepEqual(blocked.body.error.details, []);
    assert.equal(Number(blocked.headers['retry-after']) > 0, true);
    assert.ok(blocked.headers.ratelimit);
    assert.ok(blocked.headers['ratelimit-policy']);
    // Exhaustion of any endpoint does not share a counter with another one.
    const otherPath = path === 'logout' ? 'logout-all' : 'logout';
    await request(app).post(`/api/v1/auth/${otherPath}`)
      .set('Origin', 'http://localhost:5173').send({})
      .expect(otherPath === 'logout' ? 200 : 401);
  });
}

for (const [label, path, body] of [
  ['invalid email', 'register', { name: 'Student', email: 'invalid', password: 'valid-password' }],
  ['short password', 'register', { name: 'Student', email: 'a@example.test', password: 'short' }],
  ['short name', 'register', { name: 'A', email: 'a@example.test', password: 'valid-password' }],
  ['long name', 'register', { name: 'A'.repeat(101), email: 'a@example.test', password: 'valid-password' }],
  ['invalid verify token', 'verify-email', { token: 'bad-token' }],
  ['extra verification field', 'verify-email', { token: 'A'.repeat(43), roles: ['admin'] }],
  ['invalid resend email', 'resend-verification', { email: 'invalid' }],
  ['extra resend field', 'resend-verification', { email: 'a@example.test', status: 'active' }],
  ['invalid forgot email', 'forgot-password', { email: 'invalid' }],
  ['extra forgot field', 'forgot-password', { email: 'a@example.test', token: 'secret' }],
  ['short reset password', 'reset-password', { token: 'A'.repeat(43), password: 'short' }],
]) {
  test(`${label} is rejected at the HTTP boundary`, async () => {
    const response = await request(createApp()).post(`/api/v1/auth/${path}`).send(body).expect(400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    assert.ok(response.body.error.details.length);
    assert.equal('stack' in response.body.error, false);
  });
}
