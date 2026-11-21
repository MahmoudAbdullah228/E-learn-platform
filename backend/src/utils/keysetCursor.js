import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';

const schema = z.object({ v: z.literal(1), id: z.string().regex(/^[a-f\d]{24}$/),
  createdAt: z.iso.datetime({ precision: 3 }), filter: z.string().regex(/^[a-f\d]{64}$/) }).strict();
export function createKeysetCursor({ namespace, normalizeFilters }) {
  const fingerprint = filters => createHash('sha256').update(JSON.stringify(normalizeFilters(filters))).digest('hex');
  const signature = payload => createHmac('sha256', env.JWT_ACCESS_SECRET).update(`${namespace}\0`).update(payload).digest();
  const invalid = () => new ApiError(400, 'INVALID_CURSOR', 'The list cursor is invalid for these filters');
  return Object.freeze({
    encode(row, filters) {
      const payload = Buffer.from(JSON.stringify(schema.parse({ v: 1, id: String(row._id),
        createdAt: row.createdAt.toISOString(), filter: fingerprint(filters) }))).toString('base64url');
      return `${payload}.${signature(payload).toString('base64url')}`;
    },
    decode(cursor, filters) {
      if (!cursor) return null;
      try {
        if (typeof cursor !== 'string' || cursor.length > 1024) throw invalid();
        const parts = cursor.split('.');
        if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0])) throw invalid();
        const supplied = Buffer.from(parts[1], 'base64url'); const expected = signature(parts[0]);
        if (supplied.length !== expected.length || supplied.toString('base64url') !== parts[1]
            || !timingSafeEqual(supplied, expected)) throw invalid();
        const raw = Buffer.from(parts[0], 'base64url');
        if (raw.toString('base64url') !== parts[0]) throw invalid();
        const payload = schema.parse(JSON.parse(raw.toString('utf8')));
        if (payload.filter !== fingerprint(filters)) throw invalid();
        return { id: payload.id, createdAt: new Date(payload.createdAt) };
      } catch { throw invalid(); }
    },
  });
}
