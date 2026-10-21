import { z } from 'zod';

import { textSchema } from '../../utils/textValidation.js';

const id = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId').toLowerCase();
const title = textSchema({ field: 'Title', minimum: 3, maximum: 160 });
const description = textSchema({
  field: 'Description', minimum: 0, maximum: 10000, multiline: true,
});

export const courseParams = z.object({ courseId: id }).strict();
export const sectionParams = z.object({ sectionId: id }).strict();
export const courseSectionParams = z.object({ courseId: id, sectionId: id }).strict();
export const lessonParams = z.object({ lessonId: id }).strict();
export const createSectionSchema = z.object({ title }).strict();
export const updateSectionSchema = createSectionSchema;
export const createLessonSchema = z.object({
  title, description: description.default(''), isPreview: z.boolean().default(false),
}).strict();
export const updateLessonSchema = z.object({ title, description, isPreview: z.boolean() })
  .partial().strict()
  .refine(value => Object.keys(value).length > 0, { message: 'At least one field is required' });
export const orderSchema = z.object({
  orderedIds: z.array(id).max(200).refine(ids => new Set(ids).size === ids.length, {
    message: 'IDs must be unique',
  }),
}).strict();
