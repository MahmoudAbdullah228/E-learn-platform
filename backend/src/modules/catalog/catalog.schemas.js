import { z } from 'zod';

import { createSlug } from '../../utils/slug.js';
import { textSchema } from '../../utils/textValidation.js';

const page = z.string().regex(/^[1-9]\d*$/).default('1').transform(Number)
  .pipe(z.number().int().min(1).max(1_000_000));
const limit = z.string().regex(/^[1-9]\d*$/).default('20').transform(Number)
  .pipe(z.number().int().min(1).max(100));

export const catalogQuerySchema = z.object({
  q: textSchema({ field: 'Search query', minimum: 1, maximum: 100 }).optional(),
  categoryId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid category id').optional(),
  pricing: z.enum(['all', 'free', 'paid']).default('all'),
  page,
  limit,
}).strict();

export const catalogSlugSchema = z.object({
  slug: z.string().min(1).max(220).refine(value => createSlug(value) === value,
    'Invalid course slug'),
}).strict();
