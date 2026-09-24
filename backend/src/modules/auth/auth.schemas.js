import { z } from 'zod';

const emailSchema = z.string().trim().toLowerCase().email().max(254);

const passwordSchema = z
  .string()
  .min(8, 'Password must contain at least 8 characters')
  .max(128, 'Password is too long')
  .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, {
    message: 'Password must not exceed 72 UTF-8 bytes',
  });

export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export const verifyEmailSchema = z
  .object({
    token: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{43}$/, 'Verification token is invalid'),
  })
  .strict();

export const resendVerificationSchema = z
  .object({
    email: emailSchema,
  })
  .strict();
