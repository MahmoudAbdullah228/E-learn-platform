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
  assert.equal(Object.keys(json.body.paths).length, 53);
  assert.ok(json.body.paths['/users/me/courses/{courseId}/lessons/{lessonId}/progress']?.put);
  assert.ok(json.body.paths['/users/me/courses/{courseId}/last-lesson']?.put);
  assert.ok(json.body.paths['/lessons/{lessonId}/playback']?.get);
  assert.ok(json.body.paths['/lessons/{lessonId}/attachments/{assetId}/download']?.get);
  for (const [method, path] of [['post', '/courses/{courseId}/enroll'],
    ['get', '/users/me/courses'], ['get', '/users/me/courses/{courseId}'],
    ['get', '/users/me/orders'], ['get', '/users/me/orders/{orderId}'],
    ['get', '/admin/orders'], ['get', '/admin/orders/{orderId}']]) {
    assert.ok(json.body.paths[path]?.[method], `${method} ${path} is missing`);
  }
  assert.ok(json.body.paths['/courses/{courseId}/checkout']?.post);
  assert.ok(json.body.paths['/webhooks/stripe']?.post);
  assert.ok(json.body.paths['/courses']?.get);
  assert.ok(json.body.paths['/courses/{slug}']?.get);
  assert.ok(json.body.paths['/instructor/courses/{courseId}/submit-review']?.post);
  assert.ok(json.body.paths['/instructor/courses/{courseId}/reopen']?.post);
  assert.ok(json.body.paths['/admin/courses']?.get);
  assert.ok(json.body.paths['/admin/courses/{courseId}']?.get);
  assert.ok(json.body.paths['/admin/courses/{courseId}/review']?.patch);
  assert.ok(json.body.paths['/categories']?.get);
  assert.ok(json.body.paths['/admin/categories']?.get);
  assert.ok(json.body.paths['/admin/categories']?.post);
  assert.ok(json.body.paths['/admin/categories/{categoryId}']?.patch);
  assert.ok(json.body.paths['/media/upload-intents']?.post);
  assert.ok(json.body.paths['/media/{assetId}/confirm']?.post);
  assert.ok(json.body.paths['/media/{assetId}']?.delete);
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
  assert.ok(json.body.paths['/instructors/{instructorId}']?.get,
    'GET /instructors/{instructorId} is missing');
  assert.ok(json.body.paths['/instructor/profile']?.patch,
    'PATCH /instructor/profile is missing');
  assert.ok(json.body.paths['/instructor-applications']?.post,
    'POST /instructor-applications is missing');
  assert.ok(json.body.paths['/instructor-applications/me']?.get,
    'GET /instructor-applications/me is missing');
  assert.ok(json.body.paths['/admin/instructor-applications']?.get,
    'GET /admin/instructor-applications is missing');
  assert.ok(json.body.paths['/admin/instructor-applications/{applicationId}']?.patch,
    'PATCH /admin/instructor-applications/{applicationId} is missing');
  assert.ok(json.body.paths['/instructor/courses']?.get,
    'GET /instructor/courses is missing');
  assert.ok(json.body.paths['/instructor/courses']?.post,
    'POST /instructor/courses is missing');
  assert.ok(json.body.paths['/instructor/courses/{courseId}']?.get,
    'GET /instructor/courses/{courseId} is missing');
  assert.ok(json.body.paths['/instructor/courses/{courseId}']?.patch,
    'PATCH /instructor/courses/{courseId} is missing');
  assert.ok(json.body.paths['/instructor/courses/{courseId}/sections']?.get,
    'GET curriculum is missing');
  assert.ok(json.body.paths['/instructor/courses/{courseId}/sections']?.post,
    'POST section is missing');
  assert.ok(json.body.paths['/instructor/courses/{courseId}/sections/order']?.put,
    'PUT section order is missing');
  assert.ok(json.body.paths['/instructor/courses/{courseId}/sections/{sectionId}']?.delete,
    'DELETE section is missing');
  assert.ok(json.body.paths['/instructor/sections/{sectionId}/lessons']?.post,
    'POST lesson is missing');
  assert.ok(json.body.paths['/instructor/sections/{sectionId}/lessons/order']?.put,
    'PUT lesson order is missing');
  assert.ok(json.body.paths['/instructor/lessons/{lessonId}']?.patch,
    'PATCH lesson is missing');
  assert.ok(json.body.paths['/instructor/lessons/{lessonId}/video-upload']?.post,
    'POST lesson video upload is missing');
  assert.ok(json.body.paths['/webhooks/video']?.post,
    'POST video webhook is missing');
  const yaml = await request(app).get('/api/v1/openapi.yaml').expect(200);
  assert.match(yaml.headers['content-disposition'], /attachment/);
  const downloaded = yaml.text ?? yaml.body.toString('utf8');
  assert.deepEqual(parse(downloaded), json.body);
});
