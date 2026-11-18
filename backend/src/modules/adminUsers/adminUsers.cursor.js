import { createKeysetCursor } from '../../utils/keysetCursor.js';

const cursor = createKeysetCursor({ namespace: 'admin-users-cursor:v1', normalizeFilters: ({ q, role, status }) =>
  ({ q: q ?? null, role: role ?? null, status: status ?? null }) });
export const encodeAdminUsersCursor = cursor.encode;
export const decodeAdminUsersCursor = cursor.decode;
