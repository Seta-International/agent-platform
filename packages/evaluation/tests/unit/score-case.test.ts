import { describe, expect, it } from 'vitest';
import { scoreCase } from '../../src/backend/scoring/score-case.ts';

describe('scoreCase', () => {
  it('runs a code scorer (completeness) deterministically and returns a numeric score', async () => {
    const results = await scoreCase({
      scorerIds: ['completeness'],
      input: 'List the primary colors.',
      output: 'The primary colors are red, green, and blue.',
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.scorerId).toBe('completeness');
    expect(typeof results[0]?.score).toBe('number');
    expect(results[0]?.score).toBeGreaterThanOrEqual(0);
    expect(results[0]?.score).toBeLessThanOrEqual(1);
  });

  it('skips unknown scorer ids', async () => {
    const results = await scoreCase({
      scorerIds: ['does-not-exist'],
      input: 'x',
      output: 'y',
    });
    expect(results).toHaveLength(0);
  });
});
