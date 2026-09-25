import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const envModuleUrl = new URL('../src/config/env.js', import.meta.url).href;
const dbModuleUrl = new URL('../src/config/db.js', import.meta.url).href;
const adminSeedPath = fileURLToPath(new URL('../scripts/seed-admin.js', import.meta.url));
const productionAuth = {
  JWT_ACCESS_SECRET: 'M8vQ3xL9pR2nK7cD4wF6yH1jT5sZ0aB2',
  REFRESH_TOKEN_PEPPER: 'G4uN8mC1qW6eY9kP3rV7xS2dF5hJ0tL8',
};

function importEnvironment(overrides, omittedKeys = []) {
  const childEnvironment = { ...process.env, ...overrides };
  for (const key of omittedKeys) {
    delete childEnvironment[key];
  }

  return spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', `await import(${JSON.stringify(envModuleUrl)})`],
    { encoding: 'utf8', env: childEnvironment },
  );
}

test('startup fails clearly when MONGO_URI is missing', () => {
  const result = importEnvironment({ NODE_ENV: 'development' }, ['MONGO_URI']);

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /MONGO_URI is required/);
});

test('test startup requires an isolated database URI', () => {
  const result = importEnvironment({ NODE_ENV: 'test' }, ['MONGO_TEST_URI']);

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /MONGO_TEST_URI is required/);
});

test('test startup rejects the application database even when its name ends in _test', () => {
  const sharedUri = 'mongodb://localhost:27017/shared_test?retryWrites=false';
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `const module = await import(${JSON.stringify(dbModuleUrl)}); await module.connectDatabase({ maxRetries: 1 });`,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        MONGO_URI: 'mongodb://127.0.0.1/shared_test',
        MONGO_TEST_URI: sharedUri,
      },
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /must be different from MONGO_URI/);
});

test('bcrypt cost below 10 is rejected', () => {
  const result = importEnvironment({ BCRYPT_ROUNDS: '9' });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /BCRYPT_ROUNDS/);
});

test('admin seed rejects the published example password', () => {
  const result = spawnSync(process.execPath, [adminSeedPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      MONGO_URI: 'mongodb://127.0.0.1:27017/e_learning_platform',
      EMAIL_PROVIDER: 'smtp',
      EMAIL_FROM: 'no-reply@example.test',
      EMAIL_VERIFICATION_URL: 'http://localhost:5173/verify-email',
      PASSWORD_RESET_URL: 'http://localhost:5173/reset-password',
      SMTP_HOST: '127.0.0.1',
      ADMIN_NAME: 'Platform Admin',
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'replace-with-a-strong-password',
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /must be changed from the example placeholder/);
});

test('non-test startup rejects the in-memory email provider', () => {
  const result = importEnvironment({
    NODE_ENV: 'production',
    EMAIL_PROVIDER: 'memory',
    ...productionAuth,
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /allowed only when NODE_ENV=test/);
});

test('SMTP configuration requires a host', () => {
  const result = importEnvironment(
    {
      NODE_ENV: 'production',
      EMAIL_PROVIDER: 'smtp',
      ...productionAuth,
    },
    ['SMTP_HOST'],
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /SMTP_HOST is required/);
});

test('verification links require an HTTP or HTTPS URL', () => {
  const result = importEnvironment({
    EMAIL_VERIFICATION_URL: 'ftp://files.example.test/verify-email',
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /must use the HTTP or HTTPS protocol/);
});

test('production requires an HTTPS verification link', () => {
  const result = importEnvironment({
    NODE_ENV: 'production',
    EMAIL_PROVIDER: 'smtp',
    ...productionAuth,
    EMAIL_FROM: 'no-reply@example.test',
    EMAIL_VERIFICATION_URL: 'http://app.example.test/verify-email',
    PASSWORD_RESET_URL: 'https://app.example.test/reset-password',
    SMTP_HOST: 'smtp.example.test',
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /HTTPS is required in production/);
});

test('password reset links are required and allow only HTTP(S)', () => {
  const missing = importEnvironment({}, ['PASSWORD_RESET_URL']);
  assert.notEqual(missing.status, 0);
  assert.match(`${missing.stdout}${missing.stderr}`, /PASSWORD_RESET_URL is required/);

  const unsafe = importEnvironment({ PASSWORD_RESET_URL: 'ftp://files.example.test/reset' });
  assert.notEqual(unsafe.status, 0);
  assert.match(`${unsafe.stdout}${unsafe.stderr}`, /PASSWORD_RESET_URL: must use the HTTP or HTTPS protocol/);
});

test('production requires an HTTPS password reset link', () => {
  const result = importEnvironment({
    NODE_ENV: 'production',
    EMAIL_PROVIDER: 'smtp',
    ...productionAuth,
    EMAIL_FROM: 'no-reply@example.test',
    EMAIL_VERIFICATION_URL: 'https://app.example.test/verify-email',
    PASSWORD_RESET_URL: 'http://app.example.test/reset-password',
    SMTP_HOST: 'smtp.example.test',
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /PASSWORD_RESET_URL: HTTPS is required in production/);
});

test('SMTP authentication can be omitted with blank env-file values', () => {
  const result = importEnvironment({
    NODE_ENV: 'development',
    EMAIL_PROVIDER: 'smtp',
    EMAIL_FROM: 'no-reply@example.test',
    EMAIL_VERIFICATION_URL: 'http://localhost:5173/verify-email',
    PASSWORD_RESET_URL: 'http://localhost:5173/reset-password',
    SMTP_HOST: '127.0.0.1',
    SMTP_USER: '',
    SMTP_PASSWORD: '',
  });

  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

test('access tokens are fixed to the accepted 15-minute lifetime', () => {
  const result = importEnvironment({ ACCESS_TOKEN_TTL_SECONDS: '901' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /must be 900/);
});

test('authentication secrets must be independent and production-safe', () => {
  const sameSecret = 'same-secret-material-with-at-least-32-characters';
  const same = importEnvironment({
    JWT_ACCESS_SECRET: sameSecret,
    REFRESH_TOKEN_PEPPER: sameSecret,
  });
  assert.notEqual(same.status, 0);
  assert.match(`${same.stdout}${same.stderr}`, /must be different/);

  const placeholder = importEnvironment({
    NODE_ENV: 'production',
    EMAIL_PROVIDER: 'smtp',
    EMAIL_FROM: 'no-reply@example.test',
    EMAIL_VERIFICATION_URL: 'https://app.example.test/verify-email',
    PASSWORD_RESET_URL: 'https://app.example.test/reset-password',
    SMTP_HOST: 'smtp.example.test',
    JWT_ACCESS_SECRET: 'replace-with-at-least-32-random-characters',
    REFRESH_TOKEN_PEPPER: 'another-production-value-with-at-least-32-characters',
  });
  assert.notEqual(placeholder.status, 0);
  assert.match(`${placeholder.stdout}${placeholder.stderr}`, /deployment-specific/);
});
