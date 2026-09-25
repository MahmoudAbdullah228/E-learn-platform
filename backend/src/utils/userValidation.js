import { z } from 'zod';

export const nameSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .refine(name => !/[\p{Cc}\p{Cf}]/u.test(name), {
    message: 'Name must not contain control or formatting characters',
  });
