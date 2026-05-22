import { describe, expect, it } from 'vitest';
import { formatRelative } from './format-relative';

describe('formatRelative', () => {
  const now = new Date('2026-05-20T12:00:00Z');
  it('returns "—" for null/undefined', () => {
    expect(formatRelative(null, now)).toBe('—');
    expect(formatRelative(undefined, now)).toBe('—');
  });
  it('returns "now" for < 30s', () => {
    expect(formatRelative(new Date(now.getTime() - 5_000), now)).toBe('now');
  });
  it('returns "2m" for 2 minutes ago', () => {
    expect(formatRelative(new Date(now.getTime() - 2 * 60_000), now)).toBe('2m');
  });
  it('returns "1h" for 1 hour ago', () => {
    expect(formatRelative(new Date(now.getTime() - 60 * 60_000), now)).toBe('1h');
  });
  it('returns "3d" for 3 days ago', () => {
    expect(formatRelative(new Date(now.getTime() - 3 * 24 * 60 * 60_000), now)).toBe('3d');
  });
  it('returns "1w" for 9 days ago', () => {
    expect(formatRelative(new Date(now.getTime() - 9 * 24 * 60 * 60_000), now)).toBe('1w');
  });
  it('accepts ISO string input', () => {
    expect(formatRelative(new Date(now.getTime() - 60 * 60_000).toISOString(), now)).toBe('1h');
  });
});
