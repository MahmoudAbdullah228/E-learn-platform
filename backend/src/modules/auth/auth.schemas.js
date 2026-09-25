import { z } from 'zod';

import { nameSchema } from '../../utils/userValidation.js';

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const refreshTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const passwordSchema = z
  .string()
  .min(8, 'Password must contain at least 8 characters')
  .max(128, 'Password is too long')
  .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, {
    message: 'Password must not exceed 72 UTF-8 bytes',
  });

export const registerSchema = z
  .object({
    name: nameSchema,
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

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128)
      .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, {
        message: 'Password must not exceed 72 UTF-8 bytes',
      }),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{43}$/, 'Password reset token is invalid'),
    password: passwordSchema,
  })
  .strict();
