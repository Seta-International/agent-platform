import { describe, expect, it } from 'vitest';
import { SLO, stepsAsc, stepsDesc, UNIT } from './tokens';

describe('tokens', () => {
  it('encodes the error-ratio SLO', () => {
    expect(SLO.httpErrorRatioPct).toEqual({ warn: 1, crit: 5 });
  });
  it('ascending steps: green base, yellow at warn, red at crit', () => {
    expect(stepsAsc(80, 90)).toEqual([
      { value: null, color: 'green' },
      { value: 80, color: 'yellow' },
      { value: 90, color: 'red' },
    ]);
  });
  it('descending steps invert colours (higher is better)', () => {
    expect(stepsDesc(20, 10)).toEqual([
      { value: null, color: 'red' },
      { value: 10, color: 'yellow' },
      { value: 20, color: 'green' },
    ]);
  });
  it('exposes a tokens/s unit string', () => {
    expect(UNIT.TOKS).toBe('none');
  });
});
