import { describe, expect, it } from 'vitest';
import { validateConfigDraft } from '../../src/nav/performance-config-validation.ts';

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
});
