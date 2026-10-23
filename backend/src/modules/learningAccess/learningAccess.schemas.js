import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid resource id').transform(value => value.toLowerCase());
export const playbackParamsSchema = z.object({ lessonId: id }).strict();
export const downloadParamsSchema = z.object({ lessonId: id, assetId: id }).strict();
export const learningQuerySchema = z.object({}).strict();
