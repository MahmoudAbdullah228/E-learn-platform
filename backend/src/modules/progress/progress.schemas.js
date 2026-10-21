import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid resource id').transform(value => value.toLowerCase());
export const courseProgressParamsSchema = z.object({ courseId: id }).strict();
export const lessonProgressParamsSchema = z.object({ courseId: id, lessonId: id }).strict();
export const completionBodySchema = z.object({ completed: z.boolean() }).strict();
export const lastLessonBodySchema = z.object({ lessonId: id }).strict();
export const progressQuerySchema = z.object({}).strict();
