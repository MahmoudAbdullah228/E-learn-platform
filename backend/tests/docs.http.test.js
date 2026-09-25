import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import request from 'supertest';
import { parse } from 'yaml';
import { app } from '../src/app.js';

test('Swagger UI serves local scripts under an enabled CSP', async () => {
  await request(app).get('/api/v1/docs').expect(308).expect('Location', '/api/v1/docs/');
  const page = await request(app).get('/api/v1/docs/').expect(200).expect('Content-Type', /html/);
  assert.match(page.text, /id="swagger-ui"/);
  assert.match(page.headers['content-security-policy'], /script-src 'self'/);
  assert.equal(page.headers['content-security-policy'].includes('upgrade-insecure-requests'), false);
  for (const asset of ['swagger-ui.css', 'swagger-ui-bundle.js', 'swagger-init.js']) {
    await request(app).get(`/api/v1/docs/${asset}`).expect(200);
  }
  const init = await request(app).get('/api/v1/docs/swagger-init.js').expect(200);
  assert.match(init.text, /validatorUrl: null/);
});

test('downloadable contracts match the canonical document and expose only implemented operations', async () => {
  const source = await readFile(new URL('../docs/openapi.yaml', import.meta.url), 'utf8');
  const json = await request(app).get('/api/v1/openapi.json').expect(200);
  assert.deepEqual(json.body, parse(source));
  assert.equal(Object.keys(json.body.paths).length, 11);
  for (const path of [
    '/auth/login',
    '/auth/refresh',
    '/auth/logout',
    '/auth/logout-all',
    '/auth/forgot-password',
    '/auth/reset-password',
  ]) {
    assert.ok(json.body.paths[path]?.post, `${path} is missing`);
  }
  assert.ok(json.body.paths['/users/me']?.get, 'GET /users/me is missing');
  assert.ok(json.body.paths['/users/me']?.patch, 'PATCH /users/me is missing');
  const yaml = await request(app).get('/api/v1/openapi.yaml').expect(200);
  assert.match(yaml.headers['content-disposition'], /attachment/);
  const downloaded = yaml.text ?? yaml.body.toString('utf8');
  assert.deepEqual(parse(downloaded), json.body);
});
