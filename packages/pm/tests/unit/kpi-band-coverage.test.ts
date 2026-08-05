import { describe, expect, it } from 'vitest';
import {
  KPI_NORM_METRICS,
  type KpiNormMetricSeed,
} from '../../src/backend/domain/kpi-norm-data.ts';
import {
  type BandCondition,
  computeEntryStatus,
  computeScoredValue,
  evaluateBand,
  kpiValuePrecision,
} from '../../src/contracts.ts';

const metric = (name: string): KpiNormMetricSeed => {
  const m = KPI_NORM_METRICS.find((x) => x.name === name);
  if (!m) throw new Error(`no metric named ${name}`);
  return m;
};

const precisionOf = (m: KpiNormMetricSeed): number =>
  kpiValuePrecision(m.green_band, m.yellow_band, m.red_band);

const scoredValue = (m: KpiNormMetricSeed, c1: number | null, c2: number | null): number | null =>
  computeScoredValue(m.component_count, c1, c2, precisionOf(m));

const statusFor = (m: KpiNormMetricSeed, c1: number | null, c2: number | null) =>
  computeEntryStatus(scoredValue(m, c1, c2), m.green_band, m.yellow_band, m.red_band);

const thresholds = (c: BandCondition, out: number[] = []): number[] => {
  switch (c.op) {
    case 'between':
      out.push(c.min, c.max);
      break;
    case 'or':
    case 'and':
      for (const inner of c.conditions) thresholds(inner, out);
      break;
    default:
      out.push(c.value);
  }
  return out;
};

const gridOf = (m: KpiNormMetricSeed): number[] => {
  const marks = [
    ...thresholds(m.green_band),
    ...thresholds(m.yellow_band),
    ...thresholds(m.red_band),
  ];
  const scale = 10 ** precisionOf(m);
  const allowsNegative = m.component_1_min === null || m.component_1_min < 0;
  const lowest = Math.round(Math.min(...marks) * scale) - 20;
  const from = allowsNegative ? lowest : Math.max(0, lowest);
  const to = Math.round(Math.max(...marks) * scale) + 20;
  const grid: number[] = [];
  for (let i = from; i <= to; i++) grid.push(i / scale);
  return grid;
};

describe('kpiValuePrecision', () => {
  it('reads the decimal granularity that the metric own bands are written in', () => {
    expect(precisionOf(metric('Defect Leakage'))).toBe(2);
    expect(precisionOf(metric('Internal Defect Density'))).toBe(1);
    expect(precisionOf(metric('MTTD — Defect'))).toBe(0);
    expect(precisionOf(metric('Deployment Frequency'))).toBe(3);
  });
});

describe('computeScoredValue', () => {
  const leakage = metric('Defect Leakage');

  it('rounds a half up', () => {
    expect(scoredValue(leakage, 55, 1000)).toBe(0.06);
  });

  it('rounds below a half down', () => {
    expect(scoredValue(leakage, 54, 1000)).toBe(0.05);
  });

  it('rounds a half up even when the binary quotient sits just under it', () => {
    expect(scoredValue(leakage, 45, 1000)).toBe(0.05);
    expect(scoredValue(leakage, 3, 40)).toBe(0.08);
    expect(scoredValue(metric('Utilization Rate'), 23, 40)).toBe(0.58);
  });

  it('rounds a single-component value to the granularity of its own bands', () => {
    expect(scoredValue(metric('MTTD — Defect'), 3.5, null)).toBe(4);
    expect(scoredValue(metric('MTTD — Defect'), 3.4, null)).toBe(3);
  });

  it('has no value while a component is missing or the denominator is zero', () => {
    expect(scoredValue(leakage, null, 200)).toBeNull();
    expect(scoredValue(leakage, 11, null)).toBeNull();
    expect(scoredValue(leakage, 11, 0)).toBeNull();
  });
});

describe.each(KPI_NORM_METRICS.map((m) => [m.name, m] as const))('%s', (_name, m) => {
  it('scores every value on its own precision grid with exactly one band', () => {
    const offenders = gridOf(m)
      .map((value) => ({
        value,
        matched: (['green', 'yellow', 'red'] as const).filter((band) =>
          evaluateBand(
            band === 'green' ? m.green_band : band === 'yellow' ? m.yellow_band : m.red_band,
            value,
          ),
        ),
      }))
      .filter((r) => r.matched.length !== 1)
      .map((r) => `${r.value} matched [${r.matched.join(', ')}]`);
    expect(offenders).toEqual([]);
  });
});

describe('values that used to come back with no colour', () => {
  it('scores a leakage of 1 in 17 defects as amber', () => {
    expect(statusFor(metric('Defect Leakage'), 1, 17)).toBe('yellow');
  });

  it('scores a DRE of 189 in 200 defects as green', () => {
    expect(statusFor(metric('Defect Removal Efficiency (DRE)'), 189, 200)).toBe('green');
  });

  it('scores 179 of 200 milestones on time as green', () => {
    expect(statusFor(metric('On-time Delivery'), 179, 200)).toBe('green');
  });

  it('scores a busy rate of 32 in 40 hours as amber', () => {
    expect(statusFor(metric('Busy Rate'), 32, 40)).toBe('yellow');
  });

  it('scores a busy rate of 239 in 200 hours as red', () => {
    expect(statusFor(metric('Busy Rate'), 239, 200)).toBe('red');
  });
});

describe('the band a metric prints is the band it is scored against', () => {
  it('does not print an Effort Consumption red band that the engine scores amber', () => {
    const effort = metric('Effort Consumption');
    expect(computeEntryStatus(0.75, effort.green_band, effort.yellow_band, effort.red_band)).toBe(
      'yellow',
    );
    expect(evaluateBand(effort.red_band, 0.75)).toBe(false);
  });
});
