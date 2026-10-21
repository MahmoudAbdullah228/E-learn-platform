import { z } from 'zod';

import { instructorLinksSchema } from '../../utils/instructorLinks.js';
import { textSchema } from '../../utils/textValidation.js';

export const instructorIdParamsSchema = z.object({
  instructorId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid instructor id'),
}).strict();

export const updateInstructorProfileSchema = z.object({
  bio: textSchema({ minimum: 50, maximum: 2000, field: 'Bio', multiline: true }).optional(),
  expertise: textSchema({ minimum: 2, maximum: 200, field: 'Expertise' }).optional(),
  links: instructorLinksSchema.optional(),
}).strict().refine(value => Object.keys(value).length > 0, {
  message: 'At least one profile field must be supplied',
});
