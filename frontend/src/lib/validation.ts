import { z } from 'zod';

const utf8Encoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return utf8Encoder.encode(value).length;
}

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must not exceed 100 characters')
  .refine((name) => !/[\p{Cc}\p{Cf}]/u.test(name), {
    message: 'Name must not contain control or formatting characters',
  });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Please enter a valid email address')
  .max(254, 'Email must not exceed 254 characters');

export const passwordSchema = z
  .string()
  .min(8, 'Password must contain at least 8 characters')
  .max(128, 'Password is too long')
  .refine((password) => utf8ByteLength(password) <= 72, {
    message: 'Password must not exceed 72 UTF-8 bytes',
  });

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, 'Password is required')
    .max(128, 'Password is too long')
    .refine((password) => utf8ByteLength(password) <= 72, {
      message: 'Password must not exceed 72 UTF-8 bytes',
    }),
});

export const emailOnlySchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const updateProfileSchema = z.object({
  name: nameSchema,
});

export const instructorLinkSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Link label is required')
    .max(80, 'Link label must not exceed 80 characters'),
  url: z
    .string()
    .trim()
    .url('Please enter a valid URL')
    .max(2048, 'URL is too long')
    .refine((val) => {
      try {
        const parsed = new URL(val);
        return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
      } catch {
        return false;
      }
    }, 'URL must use HTTPS and must not contain credentials'),
});

export const instructorLinksSchema = z
  .array(instructorLinkSchema)
  .max(5, 'Maximum 5 links allowed')
  .refine(
    (links) => new Set(links.map((l) => l.url)).size === links.length,
    'Link URLs must be unique',
  );

export const instructorApplicationSchema = z.object({
  expertise: z
    .string()
    .trim()
    .min(2, 'Expertise must be at least 2 characters')
    .max(200, 'Expertise must not exceed 200 characters'),
  bio: z
    .string()
    .trim()
    .min(50, 'Bio must be at least 50 characters')
    .max(2000, 'Bio must not exceed 2000 characters'),
  links: instructorLinksSchema.default([]),
});

export const rejectionReasonSchema = z
  .string()
  .trim()
  .min(5, 'Rejection reason must be at least 5 characters')
  .max(500, 'Rejection reason must not exceed 500 characters');

export const courseDraftSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Title must be at least 3 characters')
    .max(160, 'Title must not exceed 160 characters'),
  categoryId: z.string().regex(/^[a-f\d]{24}$/i, 'Please select an active category'),
  shortDescription: z.union([
    z.literal(''),
    z
      .string()
      .trim()
      .min(10, 'Short description must be empty or at least 10 characters')
      .max(300, 'Short description must not exceed 300 characters'),
  ]),
  description: z
    .string()
    .trim()
    .min(20, 'Description must be at least 20 characters')
    .max(10000, 'Description must not exceed 10000 characters'),
  level: z.enum(['beginner', 'intermediate', 'advanced', 'all_levels']).nullable(),
  language: z.enum(['ar', 'en']).nullable(),
  priceMinor: z.number().int().nonnegative('Price must be 0 or greater'),
  requirements: z
    .array(z.string().trim().min(2).max(300))
    .max(30, 'Maximum 30 prerequisites allowed')
    .refine(
      (items) => new Set(items.map((i) => i.toLowerCase())).size === items.length,
      'Prerequisites must be unique',
    ),
  learningOutcomes: z
    .array(z.string().trim().min(2).max(300))
    .max(30, 'Maximum 30 learning outcomes allowed')
    .refine(
      (items) => new Set(items.map((i) => i.toLowerCase())).size === items.length,
      'Learning outcomes must be unique',
    ),
});

