import { describe, expect, it } from 'vitest';
import { absoluteActivityTime } from '../../../../../src/modules/planner/lib/format-activity-time';

describe('absoluteActivityTime', () => {
  it('formats an ISO timestamp as an absolute date-time', () => {
    const out = absoluteActivityTime('2026-06-12T14:30:00Z');
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/Jun/);
  });

  it('returns empty string for invalid input', () => {
    expect(absoluteActivityTime('not-a-date')).toBe('');
  });
});
