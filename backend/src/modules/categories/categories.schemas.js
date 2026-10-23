import { z } from 'zod';

import { createSlug } from '../../utils/slug.js';
import { textSchema } from '../../utils/textValidation.js';

const pageSchema = z.string().regex(/^[1-9]\d*$/).default('1').transform(Number)
  .pipe(z.number().int().min(1).max(1_000_000));
const limitSchema = z.string().regex(/^[1-9]\d*$/).default('20').transform(Number)
  .pipe(z.number().int().min(1).max(100));
const nameSchema = textSchema({ field: 'Category name', minimum: 2, maximum: 100 });
const slugSchema = z.string().min(1).max(120).refine(
  value => createSlug(value) === value,
  { message: 'Slug must contain normalized lowercase letters, numbers, and hyphens' },
);

export const publicCategoriesQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
}).strict();

export const adminCategoriesQuerySchema = z.object({
  isActive: z.enum(['true', 'false']).transform(value => value === 'true').optional(),
  page: pageSchema,
  limit: limitSchema,
}).strict();

export const categoryIdParamsSchema = z.object({
  categoryId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid category id'),
}).strict();

export const createCategorySchema = z.object({
  name: nameSchema,
  slug: slugSchema,
}).strict();

export const updateCategorySchema = z.object({
  name: nameSchema.optional(),
  slug: slugSchema.optional(),
  isActive: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 0, {
  message: 'At least one category field must be supplied',
});
