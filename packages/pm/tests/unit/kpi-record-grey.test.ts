import { describe, expect, it } from 'vitest';
import { computeRecordCategoryColour, computeRecordOverallColour } from '../../src/contracts.ts';

describe('computeRecordCategoryColour — one Grey metric turns the whole QCDP flag Grey', () => {
  it('is Grey when a single applied metric has no figures', () => {
    expect(computeRecordCategoryColour(['green', null, 'green'])).toBe('gray');
  });

  it('stays Grey even next to a Red, so an incomplete pillar never reads as settled', () => {
    expect(computeRecordCategoryColour(['red', null])).toBe('gray');
    expect(computeRecordCategoryColour(['yellow', null])).toBe('gray');
  });

  it('is the worst assessed colour once every applied metric is filled', () => {
    expect(computeRecordCategoryColour(['green', 'green'])).toBe('green');
    expect(computeRecordCategoryColour(['green', 'yellow'])).toBe('yellow');
    expect(computeRecordCategoryColour(['green', 'yellow', 'red'])).toBe('red');
  });

  it('carries no colour when the pillar has no applied metric at all', () => {
    expect(computeRecordCategoryColour([])).toBeNull();
  });
});

describe('computeRecordOverallColour', () => {
  it('is Grey when any pillar is Grey', () => {
    expect(computeRecordOverallColour(['green', 'gray', 'red', null])).toBe('gray');
    expect(computeRecordOverallColour(['gray', null, null, null])).toBe('gray');
  });

  it('is the worst pillar once no pillar is Grey', () => {
    expect(computeRecordOverallColour(['green', 'yellow', null, null])).toBe('yellow');
    expect(computeRecordOverallColour(['green', 'green', null, 'red'])).toBe('red');
  });

  it('carries no colour when no pillar has an applied metric', () => {
    expect(computeRecordOverallColour([null, null, null, null])).toBeNull();
    expect(computeRecordOverallColour([])).toBeNull();
  });
});
