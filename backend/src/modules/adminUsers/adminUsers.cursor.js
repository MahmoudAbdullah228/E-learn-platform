import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { financialIdSchema } from '../finance/finance.schemas.js';

const payloadSchema = z.object({ v: z.literal(1), id: financialIdSchema,
  createdAt: z.iso.datetime({ precision: 3 }), filter: z.string().regex(/^[a-f\d]{64}$/) }).strict();
const fingerprint = ({ q, role, status }) => createHash('sha256')
  .update(JSON.stringify({ q: q ?? null, role: role ?? null, status: status ?? null })).digest('hex');
const signature = payload => createHmac('sha256', env.JWT_ACCESS_SECRET)
  .update('admin-users-cursor:v1\0').update(payload).digest();
const invalidCursor = () => new ApiError(400, 'INVALID_CURSOR', 'The user list cursor is invalid for these filters');

export function encodeAdminUsersCursor(user, filters) {
  const payload = Buffer.from(JSON.stringify(payloadSchema.parse({ v: 1, id: String(user._id),
    createdAt: user.createdAt.toISOString(), filter: fingerprint(filters) }))).toString('base64url');
  return `${payload}.${signature(payload).toString('base64url')}`;
}

export function decodeAdminUsersCursor(cursor, filters) {
  if (!cursor) return null;
  try {
    if (typeof cursor !== 'string' || cursor.length > 1024) throw invalidCursor();
    const parts = cursor.split('.');
    if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0])) throw invalidCursor();
    const supplied = Buffer.from(parts[1], 'base64url');
    const expected = signature(parts[0]);
    if (supplied.length !== expected.length || supplied.toString('base64url') !== parts[1]
        || !timingSafeEqual(supplied, expected)) throw invalidCursor();
    const raw = Buffer.from(parts[0], 'base64url');
    if (raw.toString('base64url') !== parts[0]) throw invalidCursor();
    const payload = payloadSchema.parse(JSON.parse(raw.toString('utf8')));
    if (payload.filter !== fingerprint(filters)) throw invalidCursor();
    return { id: payload.id, createdAt: new Date(payload.createdAt) };
  } catch { throw invalidCursor(); }
}
