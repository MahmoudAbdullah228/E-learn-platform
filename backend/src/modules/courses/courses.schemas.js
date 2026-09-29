import { z } from 'zod';

import { textSchema } from '../../utils/textValidation.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');
const listItemSchema = textSchema({ field: 'List item', minimum: 2, maximum: 300 });
const uniqueTextListSchema = z.array(listItemSchema).max(30).refine(
  values => new Set(values.map(value => value.toLocaleLowerCase())).size === values.length,
  { message: 'List items must be unique' },
);

const courseFields = {
  title: textSchema({ field: 'Title', minimum: 3, maximum: 160 }),
  categoryId: objectIdSchema,
  description: textSchema({
    field: 'Description', minimum: 20, maximum: 10000, multiline: true,
  }),
  requirements: uniqueTextListSchema,
  learningOutcomes: uniqueTextListSchema,
  priceMinor: z.number().int().safe().nonnegative(),
  currency: z.literal('EGP'),
};

export const createCourseSchema = z.object({
  ...courseFields,
  requirements: courseFields.requirements.default([]),
  learningOutcomes: courseFields.learningOutcomes.default([]),
  currency: courseFields.currency.default('EGP'),
}).strict();

export const updateCourseSchema = z.object(courseFields).partial().strict().refine(
  value => Object.keys(value).length > 0,
  { message: 'At least one field must be supplied' },
);

export const courseIdParamsSchema = z.object({
  courseId: objectIdSchema,
}).strict();

export const listCoursesQuerySchema = z.object({
  status: z.literal('draft').default('draft'),
  page: z.string().regex(/^[1-9]\d*$/).default('1').transform(Number)
    .pipe(z.number().int().min(1).max(1_000_000)),
  limit: z.string().regex(/^[1-9]\d*$/).default('20').transform(Number)
    .pipe(z.number().int().min(1).max(100)),
}).strict();
