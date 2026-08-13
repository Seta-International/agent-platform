import { describe, expect, it } from 'vitest';
import { type BandCondition, bandMiss, pickWorstMetric } from '../../src/contracts.ts';

describe('bandMiss', () => {
  it('is zero anywhere inside the green band', () => {
    expect(bandMiss({ op: 'gte', value: 0.85 }, 0.85)).toBe(0);
    expect(bandMiss({ op: 'gte', value: 0.85 }, 0.98)).toBe(0);
    expect(bandMiss({ op: 'lte', value: 0.1 }, 0.04)).toBe(0);
    expect(bandMiss({ op: 'between', min: 0.75, max: 0.9 }, 0.83)).toBe(0);
  });

  it('scales the gap by the threshold so metrics in different units compare', () => {
    expect(bandMiss({ op: 'gte', value: 0.85 }, 0.62)).toBeCloseTo(0.2706, 4);
    expect(bandMiss({ op: 'lte', value: 0.1 }, 1)).toBeCloseTo(9, 4);
    expect(bandMiss({ op: 'between', min: 0.75, max: 0.9 }, 1.02)).toBeCloseTo(0.1333, 4);
    expect(bandMiss({ op: 'between', min: 0.75, max: 0.9 }, 0.6)).toBeCloseTo(0.2, 4);
  });

  it('measures an or-band from the nearest acceptable edge', () => {
    const band: BandCondition = {
      op: 'or',
      conditions: [
        { op: 'between', min: 0.6, max: 0.74 },
        { op: 'between', min: 0.91, max: 1 },
      ],
    };
    expect(bandMiss(band, 0.95)).toBe(0);
    expect(bandMiss(band, 1.1)).toBeCloseTo(0.1, 4);
  });

  it('falls back to the raw gap when the threshold is zero', () => {
    expect(bandMiss({ op: 'lte', value: 0 }, 3)).toBe(3);
  });
});

const metric = (
  over: Partial<{ metric_id: string; sort_order: number; green_band: BandCondition }> & {
    status: 'green' | 'yellow' | 'red';
    computed_value: number;
  },
) => ({
  metric_id: over.metric_id ?? 'm',
  sort_order: over.sort_order ?? 1,
  green_band: over.green_band ?? ({ op: 'gte', value: 1 } as BandCondition),
  status: over.status,
  computed_value: over.computed_value,
});

describe('pickWorstMetric', () => {
  it('returns null when nothing is off norm', () => {
    expect(pickWorstMetric([metric({ status: 'green', computed_value: 1 })])).toBeNull();
    expect(pickWorstMetric([])).toBeNull();
  });

  it('ranks red above yellow even when the yellow misses by more', () => {
    const worst = pickWorstMetric([
      metric({
        metric_id: 'yellow-far',
        status: 'yellow',
        computed_value: 0,
        green_band: { op: 'gte', value: 1 },
      }),
      metric({
        metric_id: 'red-near',
        status: 'red',
        computed_value: 0.99,
        green_band: { op: 'gte', value: 1 },
      }),
    ]);
    expect(worst?.metric_id).toBe('red-near');
  });

  it('picks the largest normalised miss within the same status, not catalogue order', () => {
    const worst = pickWorstMetric([
      metric({
        metric_id: 'quality-first',
        sort_order: 1,
        status: 'red',
        computed_value: 0.62,
        green_band: { op: 'gte', value: 0.85 },
      }),
      metric({
        metric_id: 'delivery-later',
        sort_order: 26,
        status: 'red',
        computed_value: 1,
        green_band: { op: 'lte', value: 0.1 },
      }),
    ]);
    expect(worst?.metric_id).toBe('delivery-later');
  });

  it('breaks a tie by catalogue order so the pick is stable', () => {
    const worst = pickWorstMetric([
      metric({
        metric_id: 'later',
        sort_order: 9,
        status: 'red',
        computed_value: 0.5,
        green_band: { op: 'gte', value: 1 },
      }),
      metric({
        metric_id: 'earlier',
        sort_order: 2,
        status: 'red',
        computed_value: 0.5,
        green_band: { op: 'gte', value: 1 },
      }),
    ]);
    expect(worst?.metric_id).toBe('earlier');
  });

  it('falls back to yellow when no metric is red', () => {
    const worst = pickWorstMetric([
      metric({ metric_id: 'g', status: 'green', computed_value: 1 }),
      metric({
        metric_id: 'y',
        status: 'yellow',
        computed_value: 0.4,
        green_band: { op: 'gte', value: 1 },
      }),
    ]);
    expect(worst?.metric_id).toBe('y');
  });
});
