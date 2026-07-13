import { describe, expect, it } from 'vitest';
import { fractionToPct, pctToFraction } from '../../src/pages/ra-shared.tsx';

describe('allocation fraction <-> percentage', () => {
  it('renders a stored percentage as a 0–1 fraction string', () => {
    expect(pctToFraction(0)).toBe('0');
    expect(pctToFraction(10)).toBe('0.1');
    expect(pctToFraction(30)).toBe('0.3');
    expect(pctToFraction(80)).toBe('0.8');
    expect(pctToFraction(100)).toBe('1');
  });

  it('converts a fraction back to an integer percentage without float drift', () => {
    expect(fractionToPct('0')).toBe(0);
    expect(fractionToPct('0.1')).toBe(10);
    expect(fractionToPct('0.8')).toBe(80); // 0.8 * 100 = 80.00000000000001 in JS — must round
    expect(fractionToPct('1')).toBe(100);
  });

  it('round-trips clean step values exactly', () => {
    for (const pct of [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
      expect(fractionToPct(pctToFraction(pct))).toBe(pct);
    }
  });

  it('preserves a non-step percentage rather than snapping it', () => {
    // 33% has no 0.1 step, but the value must survive a display round-trip.
    expect(pctToFraction(33)).toBe('0.33');
    expect(fractionToPct('0.33')).toBe(33);
  });

  it('treats an empty fraction as zero', () => {
    expect(fractionToPct('')).toBe(0);
  });
});
