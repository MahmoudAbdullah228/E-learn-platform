import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatEgpAmount,
  formatEgpPrice,
  formatTimestamp,
} from '@/lib/formatters';

describe('formatters', () => {
  it('formats EGP prices from minor units without floating-point errors', () => {
    expect(formatEgpPrice(0)).toBe('Free');
    expect(formatEgpPrice(129900)).toBe('EGP 1,299');
    expect(formatEgpPrice(129950)).toBe('EGP 1,299.50');
    expect(formatEgpPrice(null)).toBe('—');
  });

  it('formats EGP amounts including zero and negatives', () => {
    expect(formatEgpAmount(0)).toBe('EGP 0');
    expect(formatEgpAmount(-5000)).toBe('-EGP 50');
  });

  it('formats durations from seconds and never shows null as 0', () => {
    expect(formatDuration(null)).toBe('Duration unavailable');
    expect(formatDuration(undefined)).toBe('Duration unavailable');
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(90)).toBe('1m 30s');
    expect(formatDuration(3660)).toBe('1h 1m');
  });

  it('formats playback timestamps', () => {
    expect(formatTimestamp(null)).toBe('--:--');
    expect(formatTimestamp(65)).toBe('01:05');
    expect(formatTimestamp(3665)).toBe('1:01:05');
  });
});
