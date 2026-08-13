import { describe, expect, it } from 'vitest';
import {
  computeRecordCategoryColour,
  computeRecordOverallColour,
  incompleteRecordMetrics,
} from '../../src/contracts.ts';

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

describe('incompleteRecordMetrics — names what is holding the record back', () => {
  const defs = [
    { metric_id: 'a', name: 'Defect Leakage' },
    { metric_id: 'b', name: 'Margin' },
    { metric_id: 'c', name: 'On-time Delivery' },
  ];

  it('lists every applied metric with no assessed colour, in the order given', () => {
    const statuses = new Map<string, 'green' | 'yellow' | 'red' | null>([
      ['a', 'green'],
      ['b', null],
      ['c', null],
    ]);
    expect(incompleteRecordMetrics(defs, (d) => statuses.get(d.metric_id) ?? null)).toEqual([
      'Margin',
      'On-time Delivery',
    ]);
  });

  it('is empty once every applied metric is assessed', () => {
    expect(incompleteRecordMetrics(defs, () => 'green')).toEqual([]);
  });

  it('is empty when nothing is applied', () => {
    expect(incompleteRecordMetrics([], () => null)).toEqual([]);
  });
});
