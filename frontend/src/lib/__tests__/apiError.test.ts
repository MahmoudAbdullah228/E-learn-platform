import { describe, expect, it } from 'vitest';
import { parseApiError } from '@/lib/apiError';

describe('parseApiError', () => {
  it('parses structured backend error envelopes and validation details', () => {
    const parsed = parseApiError({
      status: 400,
      data: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [{ field: 'email', message: 'Invalid email' }],
        },
      },
    });

    expect(parsed.status).toBe(400);
    expect(parsed.code).toBe('VALIDATION_ERROR');
    expect(parsed.message).toBe('Validation failed');
    expect(parsed.details).toEqual([{ field: 'email', message: 'Invalid email' }]);
  });

  it('extracts Retry-After seconds on 429 rate-limit responses', () => {
    const parsed = parseApiError({
      status: 429,
      data: {
        retryAfterSeconds: 45,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
          details: [],
        },
      },
    });

    expect(parsed.status).toBe(429);
    expect(parsed.retryAfterSeconds).toBe(45);
  });

  it('handles network FETCH_ERROR cleanly', () => {
    const parsed = parseApiError({ status: 'FETCH_ERROR', error: 'TypeError' });
    expect(parsed.code).toBe('NETWORK_ERROR');
    expect(parsed.message).toContain('Unable to reach the server');
  });
});
