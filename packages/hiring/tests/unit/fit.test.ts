import { describe, expect, it } from 'vitest';
import { computeFit } from '../../src/backend/domain/fit.ts';

describe('computeFit', () => {
  it('counts a required skill met only when level >= min_level', () => {
    const required = [
      { skill_id: 'a', min_level: 3 },
      { skill_id: 'b', min_level: null },
    ];
    const have = [
      { skill_id: 'a', level: 2 },
      { skill_id: 'b', level: 0 },
    ];
    const fit = computeFit(required, have);
    expect(fit).toEqual({ met: 1, required: 2, score: 0.5, strong: false });
  });

  it('flags a strong match when every required skill is met', () => {
    const fit = computeFit([{ skill_id: 'a', min_level: 1 }], [{ skill_id: 'a', level: 5 }]);
    expect(fit).toEqual({ met: 1, required: 1, score: 1, strong: true });
  });

  it('is not strong when no skills are required', () => {
    expect(computeFit([], [{ skill_id: 'a', level: 5 }])).toEqual({
      met: 0,
      required: 0,
      score: 0,
      strong: false,
    });
  });
});
