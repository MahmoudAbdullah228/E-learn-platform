import { z } from 'zod';

import { textSchema } from './textValidation.js';

const unsafeCharacterPattern = /[\p{Cc}\p{Cf}]/u;

export function normalizeInstructorUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 2048 || unsafeCharacterPattern.test(trimmed)) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const normalized = url.toString();
    return normalized.length <= 2048 ? normalized : null;
  } catch {
    return null;
  }
}

export function isValidInstructorLinkLabel(value) {
  return typeof value === 'string' && value === value.trim()
    && value.length >= 1 && value.length <= 80 && !unsafeCharacterPattern.test(value);
}

const instructorUrlSchema = z.string().trim().min(1).max(2048)
  .transform((value, context) => {
    const normalized = normalizeInstructorUrl(value);
    if (!normalized) {
      context.addIssue({
        code: 'custom',
        message: 'URL must use HTTPS, contain no credentials or unsafe characters, and fit within 2048 characters after normalization',
      });
      return z.NEVER;
    }
    return normalized;
  });

export const instructorLinkSchema = z.object({
  label: textSchema({ field: 'Link label', minimum: 1, maximum: 80 }),
  url: instructorUrlSchema,
}).strict();

export const instructorLinksSchema = z.array(instructorLinkSchema).max(5).refine(
  links => new Set(links.map(link => link.url)).size === links.length,
  { message: 'Instructor link URLs must be unique' },
);
