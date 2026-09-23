import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const envModuleUrl = new URL('../src/config/env.js', import.meta.url).href;
const dbModuleUrl = new URL('../src/config/db.js', import.meta.url).href;
const adminSeedPath = fileURLToPath(new URL('../scripts/seed-admin.js', import.meta.url));

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
      ADMIN_NAME: 'Platform Admin',
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'replace-with-a-strong-password',
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /must be changed from the example placeholder/);
});
