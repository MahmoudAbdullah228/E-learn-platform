import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { parse, validate } from '@readme/openapi-parser';

const contractUrl = new URL('../docs/openapi.yaml', import.meta.url);
const contractPath = fileURLToPath(contractUrl);
const validation = await validate(contractPath);
const contract = await parse(contractPath);

assert.equal(validation.valid, true, 'OpenAPI schema validation failed');
assert.equal(contract.openapi, '3.1.0');
for (const path of ['/users/me/courses/{courseId}/lessons/{lessonId}/progress',
  '/users/me/courses/{courseId}/last-lesson']) {
  const operation = contract.paths[path]?.put;
  assert.ok(operation, `PUT ${path} is missing`);
  assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
  assert.equal(operation.requestBody.required, true);
  for (const status of ['200', '400', '401', '403', '404', '409', '429', '503']) {
    assert.ok(operation.responses[status], `${path} response ${status} is missing`);
  }
}
for (const path of ['/lessons/{lessonId}/playback', '/lessons/{lessonId}/attachments/{assetId}/download']) {
  const operation = contract.paths[path]?.get;
  assert.ok(operation, `GET ${path} is missing`);
  for (const status of ['200', '400', '401', '403', '404', '409', '429', '503']) {
    assert.ok(operation.responses[status], `${path} response ${status} is missing`);
  }
  assert.equal(operation.responses['200'].headers['Cache-Control'].schema.const, 'no-store');
}
assert.ok(contract.paths['/lessons/{lessonId}/playback'].get.security.some(value => Object.keys(value).length === 0));
assert.deepEqual(contract.paths['/lessons/{lessonId}/attachments/{assetId}/download'].get.security,
  [{ bearerAuth: [] }]);
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
for (const [method, path, requiresAdmin] of [
  ['get', '/categories', false],
  ['get', '/admin/categories', true],
  ['post', '/admin/categories', true],
  ['patch', '/admin/categories/{categoryId}', true],
]) {
  const operation = contract.paths[path]?.[method];
  assert.ok(operation, `${method.toUpperCase()} ${path} is missing from the OpenAPI contract`);
  if (requiresAdmin) {
    assert.ok(operation.security?.some(value => value.bearerAuth),
      `${method.toUpperCase()} ${path} must require bearer authentication`);
    assert.ok(operation.responses['403'], `${method.toUpperCase()} ${path} must document admin-only access`);
  }
}
assert.ok(contract.paths['/admin/instructor-applications/{applicationId}'].patch.responses['409'],
  'Application review must document state conflicts');
for (const path of ['/courses', '/courses/{slug}']) {
  const operation = contract.paths[path]?.get;
  assert.ok(operation, `GET ${path} is missing from the OpenAPI contract`);
  assert.equal(operation.security, undefined, `GET ${path} must be public`);
}
assert.ok(contract.components.schemas.CatalogCourseSummary,
  'Catalog summary schema is missing');
assert.ok(contract.components.schemas.CatalogCourseDetails,
  'Catalog detail schema is missing');
for (const field of ['sectionCount', 'lessonCount', 'totalDurationSeconds', 'unknownDurationCount']) {
  assert.ok(contract.components.schemas.CatalogCourseDetails.required.includes(field),
    `Catalog detail ${field} must be required`);
  assert.ok(contract.components.schemas.CatalogCourseDetails.properties[field]);
}
assert.ok(contract.components.schemas.PublicUser.properties.avatarUrl,
  'Profile avatar display URL is missing');
assert.equal(contract.components.schemas.ProfileResponse.properties.data.properties.user.$ref,
  '#/components/schemas/UserProfile');
assert.ok(contract.components.schemas.InstructorProfile.required.includes('avatarUrl'));
assert.ok(contract.paths['/courses/{courseId}/checkout']?.post,
  'POST course checkout is missing');
assert.ok(contract.paths['/courses/{courseId}/checkout'].post.security?.some(v => v.bearerAuth),
  'Checkout requires bearer authentication');
for (const status of ['200', '201', '400', '401', '403', '404', '409', '429', '503']) {
  assert.ok(contract.paths['/courses/{courseId}/checkout'].post.responses[status],
    `Checkout response ${status} is missing`);
}
assert.ok(contract.components.schemas.CheckoutResponse, 'Checkout response schema is missing');
const stripeWebhook = contract.paths['/webhooks/stripe']?.post;
for (const [method, path] of [['post', '/courses/{courseId}/enroll'],
  ['get', '/users/me/courses'], ['get', '/users/me/courses/{courseId}'],
  ['get', '/users/me/orders'], ['get', '/users/me/orders/{orderId}'],
  ['get', '/admin/orders'], ['get', '/admin/orders/{orderId}']]) {
  const operation = contract.paths[path]?.[method];
  assert.ok(operation, `${method} ${path} is missing`);
  assert.ok(operation.security?.some(v => v.bearerAuth), `${path} requires bearer authentication`);
  for (const status of ['200', '400', '401', '403', '429', '503']) {
    assert.ok(operation.responses[status], `${path} response ${status} is missing`);
  }
}
assert.ok(contract.paths['/courses/{courseId}/enroll'].post.responses['201']);
for (const name of ['EnrollmentResponse', 'LibraryResponse', 'LearningCourseResponse',
  'OrderListResponse', 'OrderDetailsResponse', 'AdminOrderListResponse', 'AdminOrderDetailsResponse']) {
  assert.ok(contract.components.schemas[name], `${name} schema is missing`);
}
assert.ok(stripeWebhook, 'Stripe webhook operation is missing');
assert.deepEqual(stripeWebhook.security, [], 'Stripe webhook must not require JWT authentication');
assert.ok(stripeWebhook.parameters.some(p => p.name === 'Stripe-Signature' && p.required),
  'Stripe webhook signature header is required');
for (const status of ['200', '400', '409', '413', '415', '500']) {
  assert.ok(stripeWebhook.responses[status], `Stripe webhook response ${status} is missing`);
}
for (const [method, path] of [
  ['post', '/instructor/courses/{courseId}/submit-review'],
  ['post', '/instructor/courses/{courseId}/reopen'],
  ['get', '/admin/courses'],
  ['get', '/admin/courses/{courseId}'],
  ['patch', '/admin/courses/{courseId}/review'],
]) {
  const operation = contract.paths[path]?.[method];
  assert.ok(operation, `${method.toUpperCase()} ${path} is missing from the OpenAPI contract`);
  assert.ok(operation.security?.some(value => value.bearerAuth),
    `${method.toUpperCase()} ${path} must require bearer authentication`);
  assert.ok(operation.responses['403'], `${method.toUpperCase()} ${path} must document role denial`);
}
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
