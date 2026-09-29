import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { parse, validate } from '@readme/openapi-parser';

const contractUrl = new URL('../docs/openapi.yaml', import.meta.url);
const contractPath = fileURLToPath(contractUrl);
const validation = await validate(contractPath);
const contract = await parse(contractPath);

assert.equal(validation.valid, true, 'OpenAPI schema validation failed');
assert.equal(contract.openapi, '3.1.0');
assert.ok(contract.paths['/health']?.get, 'GET /health is missing from the OpenAPI contract');
assert.ok(
  contract.paths['/auth/register']?.post,
  'POST /auth/register is missing from the OpenAPI contract',
);
assert.ok(
  contract.paths['/auth/verify-email']?.post,
  'POST /auth/verify-email is missing from the OpenAPI contract',
);
assert.ok(
  contract.paths['/auth/resend-verification']?.post,
  'POST /auth/resend-verification is missing from the OpenAPI contract',
);
for (const path of [
  '/auth/login', '/auth/refresh', '/auth/logout', '/auth/logout-all',
  '/auth/forgot-password', '/auth/reset-password',
]) {
  assert.ok(contract.paths[path]?.post, `POST ${path} is missing from the OpenAPI contract`);
}
assert.ok(contract.paths['/users/me']?.get, 'GET /users/me is missing from the OpenAPI contract');
assert.ok(contract.paths['/users/me']?.patch,
  'PATCH /users/me is missing from the OpenAPI contract');
for (const method of ['get', 'patch']) {
  assert.ok(contract.paths['/users/me'][method].security?.some(value => value.bearerAuth),
    `${method.toUpperCase()} /users/me must require bearer authentication`);
}
for (const [method, path] of [
  ['post', '/instructor-applications'],
  ['get', '/instructor-applications/me'],
  ['get', '/admin/instructor-applications'],
  ['patch', '/admin/instructor-applications/{applicationId}'],
]) {
  assert.ok(contract.paths[path]?.[method],
    `${method.toUpperCase()} ${path} is missing from the OpenAPI contract`);
  assert.ok(contract.paths[path][method].security?.some(value => value.bearerAuth),
    `${method.toUpperCase()} ${path} must require bearer authentication`);
}
assert.ok(contract.paths['/admin/instructor-applications'].get.responses['403'],
  'Admin application listing must document role authorization');
assert.ok(contract.paths['/admin/instructor-applications/{applicationId}'].patch.responses['409'],
  'Application review must document state conflicts');
for (const [method, path] of [
  ['get', '/instructor/courses'],
  ['post', '/instructor/courses'],
  ['get', '/instructor/courses/{courseId}'],
  ['patch', '/instructor/courses/{courseId}'],
]) {
  assert.ok(contract.paths[path]?.[method],
    `${method.toUpperCase()} ${path} is missing from the OpenAPI contract`);
  assert.ok(contract.paths[path][method].security?.some(value => value.bearerAuth),
    `${method.toUpperCase()} ${path} must require bearer authentication`);
}
assert.ok(contract.components.schemas.Course, 'Course schema is missing');
assert.ok(contract.components.schemas.CreateCourseRequest,
  'CreateCourseRequest schema is missing');
assert.ok(contract.components.schemas.UpdateCourseRequest,
  'UpdateCourseRequest schema is missing');
for (const [method, path] of [
  ['get', '/instructor/courses/{courseId}/sections'],
  ['post', '/instructor/courses/{courseId}/sections'],
  ['put', '/instructor/courses/{courseId}/sections/order'],
  ['patch', '/instructor/courses/{courseId}/sections/{sectionId}'],
  ['delete', '/instructor/courses/{courseId}/sections/{sectionId}'],
  ['post', '/instructor/sections/{sectionId}/lessons'],
  ['put', '/instructor/sections/{sectionId}/lessons/order'],
  ['patch', '/instructor/lessons/{lessonId}'],
  ['delete', '/instructor/lessons/{lessonId}'],
]) {
  assert.ok(contract.paths[path]?.[method],
    `${method.toUpperCase()} ${path} is missing from the OpenAPI contract`);
  assert.ok(contract.paths[path][method].security?.some(value => value.bearerAuth),
    `${method.toUpperCase()} ${path} must require bearer authentication`);
}
for (const schema of ['Section', 'Lesson', 'OrderRequest', 'CurriculumResponse']) {
  assert.ok(contract.components.schemas[schema], `${schema} schema is missing`);
}
assert.ok(contract.paths['/instructor/lessons/{lessonId}/video-upload']?.post,
  'POST lesson video upload is missing from the OpenAPI contract');
assert.ok(contract.paths['/instructor/lessons/{lessonId}/video-upload'].post.security
  ?.some(value => value.bearerAuth), 'Lesson video upload must require bearer authentication');
assert.ok(contract.paths['/webhooks/video']?.post,
  'POST video webhook is missing from the OpenAPI contract');
assert.equal(contract.paths['/webhooks/video'].post.security, undefined,
  'Mux webhook must not require user bearer authentication');
assert.ok(contract.paths['/webhooks/video'].post.parameters
  ?.some(parameter => parameter.name === 'mux-signature' && parameter.required),
  'Mux webhook signature header is missing');
assert.ok(contract.components.schemas.VideoUploadResponse,
  'VideoUploadResponse schema is missing');
assert.ok(contract.components.schemas.VideoWebhookResponse,
  'VideoWebhookResponse schema is missing');
assert.ok(contract.components.securitySchemes.bearerAuth, 'Bearer security scheme is missing');
assert.ok(contract.components.securitySchemes.refreshCookie,
  'Refresh-cookie security scheme is missing');
assert.ok(contract.components.schemas.SuccessResponse, 'SuccessResponse schema is missing');
assert.ok(contract.components.schemas.ErrorResponse, 'ErrorResponse schema is missing');
assert.ok(contract.components.schemas.InstructorApplication,
  'InstructorApplication schema is missing');
for (const path of Object.keys(contract.paths).filter(path => path.startsWith('/auth/'))) {
  assert.ok(contract.paths[path].post.responses['429'], `${path} must document rate limiting`);
}
for (const path of ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/logout-all', '/auth/reset-password']) {
  assert.ok(contract.paths[path].post.responses['200'].headers?.['Set-Cookie'],
    `${path} must document its cookie response`);
}
for (const header of ['Retry-After', 'RateLimit', 'RateLimit-Policy']) {
  assert.ok(contract.components.responses.RateLimitError.headers[header],
    `${header} is missing from rate-limit responses`);
}
