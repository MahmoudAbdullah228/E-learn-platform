import { z } from 'zod';

const cursorId = z.string().regex(/^[a-f0-9]{24}$/);
export const pageOptions = z.strictObject({ after: cursorId.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100) });
export const migrationOptions = pageOptions.extend({ apply: z.boolean().default(false) });
