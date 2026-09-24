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
for (const path of ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/logout-all']) {
  assert.ok(contract.paths[path]?.post, `POST ${path} is missing from the OpenAPI contract`);
}
assert.ok(contract.components.securitySchemes.bearerAuth, 'Bearer security scheme is missing');
assert.ok(contract.components.securitySchemes.refreshCookie,
  'Refresh-cookie security scheme is missing');
assert.ok(contract.components.schemas.SuccessResponse, 'SuccessResponse schema is missing');
assert.ok(contract.components.schemas.ErrorResponse, 'ErrorResponse schema is missing');
