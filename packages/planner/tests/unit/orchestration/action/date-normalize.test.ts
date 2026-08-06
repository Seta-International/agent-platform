import { describe, expect, it } from 'vitest';
import { normalizeInstant } from '../../../../src/backend/orchestration/action/date-normalize.ts';

// PLATFORM_TIMEZONE defaults to Asia/Ho_Chi_Minh (UTC+7), so local midnight on
// 2026-08-07 is 2026-08-06T17:00:00Z and 23:59 local is 2026-08-07T16:59:00Z.
describe('normalizeInstant', () => {
  it('expands a date-only due date to 23:59 platform-local', () => {
    expect(normalizeInstant('2026-08-07', 'end')).toBe('2026-08-07T16:59:00.000Z');
  });

  it('expands a date-only start date to 00:00 platform-local', () => {
    expect(normalizeInstant('2026-08-07', 'start')).toBe('2026-08-06T17:00:00.000Z');
  });

  it('passes a full offset-bearing timestamp through untouched', () => {
    const iso = '2026-08-07T09:30:00+07:00';
    expect(normalizeInstant(iso, 'end')).toBe(iso);
  });

  it('honours an explicit timezone override', () => {
    expect(normalizeInstant('2026-08-07', 'start', 'UTC')).toBe('2026-08-07T00:00:00.000Z');
  });
});
