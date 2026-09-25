import { z } from 'zod';

import { nameSchema } from '../../utils/userValidation.js';

export const updateProfileSchema = z
  .object({
    name: nameSchema,
  })
  .strict();
