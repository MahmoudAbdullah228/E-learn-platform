import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const intentSchema = z.object({
  purpose: z.enum(['avatar', 'course_cover', 'lesson_attachment']),
  targetId: objectId,
}).strict();
export const assetParamsSchema = z.object({ assetId: objectId }).strict();
export const emptyBodySchema = z.object({}).strict();
