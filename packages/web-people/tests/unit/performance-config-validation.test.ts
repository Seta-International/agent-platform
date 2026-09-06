import { describe, expect, it } from 'vitest';
import { validateConfigDraft, weightProblem } from '../../src/nav/performance-config-validation.ts';

describe('weightProblem', () => {
  it('passes a whole percentage above zero', () => {
    expect(weightProblem(20)).toBeNull();
  });

  it('names the whole-number rule for a decimal', () => {
    expect(weightProblem(19.9)).toBe('Whole numbers only.');
  });

  it.each([0, -10])('names the above-zero rule for %p', (weight) => {
    expect(weightProblem(weight)).toBe('Weight must be greater than 0%.');
  });
});

describe('validateConfigDraft', () => {
  it('accepts 100% group sum with matching criteria', () => {
    expect(
      validateConfigDraft([
        { weight: 60, criteria: [{ weight: 40 }, { weight: 20 }] },
        { weight: 40, criteria: [{ weight: 40 }] },
      ]),
    ).toBeNull();
  });

  it('rejects group total ≠ 100', () => {
    expect(validateConfigDraft([{ weight: 50, criteria: [{ weight: 50 }] }])).toMatch(/100/);
  });

  it('rejects criteria sum ≠ group weight', () => {
    expect(
      validateConfigDraft([{ weight: 100, criteria: [{ weight: 40 }, { weight: 40 }] }]),
    ).toMatch(/equal/i);
  });

  it('rejects a decimal weight on either side', () => {
    expect(validateConfigDraft([{ weight: 99.9, criteria: [{ weight: 99.9 }] }])).toMatch(
      /whole numbers/i,
    );
    expect(validateConfigDraft([{ weight: 100, criteria: [{ weight: 100.5 }] }])).toMatch(
      /whole numbers/i,
    );
  });

  it('rejects a weight of zero or below on either side', () => {
    expect(
      validateConfigDraft([
        { weight: 100, criteria: [{ weight: 100 }] },
        { weight: 0, criteria: [{ weight: 0 }] },
      ]),
    ).toMatch(/greater than 0/i);
    expect(
      validateConfigDraft([{ weight: 100, criteria: [{ weight: 110 }, { weight: -10 }] }]),
    ).toMatch(/greater than 0/i);
  });

  it('rejects a group with no criteria (server requires at least one)', () => {
    // A weight-0 group with zero criteria would otherwise pass the sum checks
    // (0 === 0) yet 400 on the server's `criteria.min(1)`.
    expect(
      validateConfigDraft([
        { weight: 100, criteria: [{ weight: 100 }] },
        { weight: 0, criteria: [] },
      ]),
    ).toMatch(/at least one criterion/i);
  });
});
