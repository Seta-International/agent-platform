import { describe, expect, it } from 'vitest';
import { computeAvailabilityScore } from '../../../../src/backend/orchestration/agents/avai-checker.score.ts';

describe('computeAvailabilityScore', () => {
  it('ooo is always 0, regardless of workload', () => {
    expect(computeAvailabilityScore('ooo', 0)).toBe(0);
    expect(computeAvailabilityScore('ooo', 5)).toBe(0);
  });

  it('available with no in-progress tasks scores 1', () => {
    expect(computeAvailabilityScore('available', 0)).toBe(1);
  });

  it('available halves roughly every 3 in-progress tasks', () => {
    expect(computeAvailabilityScore('available', 3)).toBeCloseTo(0.5, 10);
    expect(computeAvailabilityScore('available', 6)).toBeCloseTo(0.25, 10);
  });

  it('busy applies the 0.35 status multiplier on top of workload decay', () => {
    expect(computeAvailabilityScore('busy', 0)).toBeCloseTo(0.35, 10);
    expect(computeAvailabilityScore('busy', 3)).toBeCloseTo(0.175, 10);
  });

  it('clamps a negative count to the count-0 score', () => {
    expect(computeAvailabilityScore('available', -2)).toBe(1);
  });
});
