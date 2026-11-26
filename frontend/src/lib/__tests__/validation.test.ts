import { describe, expect, it } from 'vitest';
import {
  courseDraftSchema,
  emailSchema,
  instructorApplicationSchema,
  nameSchema,
  passwordSchema,
  registerSchema,
  rejectionReasonSchema,
  utf8ByteLength,
} from '@/lib/validation';

describe('validation schemas', () => {
  it('normalizes and validates email addresses', () => {
    expect(emailSchema.parse('  USER@Example.COM ')).toBe('user@example.com');
    expect(() => emailSchema.parse('not-an-email')).toThrow();
  });

  it('rejects control characters in names and enforces length', () => {
    expect(nameSchema.parse('  Nour Ali  ')).toBe('Nour Ali');
    expect(() => nameSchema.parse('A')).toThrow();
    expect(() => nameSchema.parse('Nour\u0007Ali')).toThrow();
  });

  it('enforces 8+ chars and <= 72 UTF-8 bytes on passwords including multi-byte chars', () => {
    expect(passwordSchema.parse('ValidPass123')).toBe('ValidPass123');
    expect(() => passwordSchema.parse('short')).toThrow();

    // 25 Arabic chars = 50 UTF-8 bytes (valid)
    const arabicValid = 'م'.repeat(25);
    expect(utf8ByteLength(arabicValid)).toBe(50);
    expect(passwordSchema.parse(arabicValid)).toBe(arabicValid);

    // 37 Arabic chars = 74 UTF-8 bytes (exceeds 72 UTF-8 bytes even though length < 72)
    const arabicTooLong = 'م'.repeat(37);
    expect(utf8ByteLength(arabicTooLong)).toBe(74);
    expect(() => passwordSchema.parse(arabicTooLong)).toThrow();
  });

  it('validates registration payload strictly', () => {
    const parsed = registerSchema.parse({
      name: 'Sara',
      email: 'sara@example.com',
      password: 'Password123',
    });
    expect(parsed).toEqual({
      name: 'Sara',
      email: 'sara@example.com',
      password: 'Password123',
    });
  });

  it('validates instructor application links (HTTPS-only, <=5 unique)', () => {
    expect(() =>
      instructorApplicationSchema.parse({
        expertise: 'Backend Systems',
        bio: 'A'.repeat(60),
        links: [{ label: 'Site', url: 'http://insecure.example.com' }],
      }),
    ).toThrow();

    expect(() =>
      instructorApplicationSchema.parse({
        expertise: 'Backend Systems',
        bio: 'A'.repeat(60),
        links: [
          { label: 'One', url: 'https://example.com' },
          { label: 'Two', url: 'https://example.com' },
        ],
      }),
    ).toThrow();

    const valid = instructorApplicationSchema.parse({
      expertise: 'Backend Systems',
      bio: 'A'.repeat(60),
      links: [{ label: 'GitHub', url: 'https://github.com/example' }],
    });
    expect(valid.links).toHaveLength(1);
  });

  it('validates course draft constraints and rejection reason length', () => {
    expect(() => rejectionReasonSchema.parse('bad')).toThrow();
    expect(rejectionReasonSchema.parse('Needs clearer examples')).toBe(
      'Needs clearer examples',
    );

    const validCourse = courseDraftSchema.parse({
      title: 'React Fundamentals',
      categoryId: '507f1f77bcf86cd799439011',
      shortDescription: '',
      description: 'A thorough guide to React fundamentals and hooks.',
      level: 'beginner',
      language: 'en',
      priceMinor: 129900,
      requirements: ['Basic JavaScript'],
      learningOutcomes: ['Build React components'],
    });
    expect(validCourse.priceMinor).toBe(129900);
  });
});
