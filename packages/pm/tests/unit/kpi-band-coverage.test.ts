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
} from '../../src/contracts.ts';

const metric = (name: string): KpiNormMetricSeed => {
  const m = KPI_NORM_METRICS.find((x) => x.name === name);
  if (!m) throw new Error(`no metric named ${name}`);
  return m;
};

const scoredValue = (m: KpiNormMetricSeed, c1: number | null, c2: number | null): number | null =>
  computeScoredValue(m.component_count, c1, c2);

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
  ].sort((a, b) => a - b);
  const allowsNegative = m.component_1_min === null || m.component_1_min < 0;
  const span = Math.max(...marks) - Math.min(...marks) || 1;
  const grid = new Set<number>();
  const at = (v: number) => grid.add(Number(v.toFixed(6)));
  let previous: number | null = null;
  for (const mark of marks) {
    for (const offset of [-span / 3, -0.001, -0.0001, 0, 0.0001, 0.001, span / 3])
      at(mark + offset);
    if (previous !== null) at((previous + mark) / 2);
    previous = mark;
  }
  const from = Math.min(...marks) - span;
  const to = Math.max(...marks) + span;
  for (let i = 0; i <= 200; i++) at(from + (i / 200) * (to - from));
  return [...grid].filter((v) => allowsNegative || v >= 0).sort((a, b) => a - b);
};

describe('computeScoredValue', () => {
  const leakage = metric('Defect Leakage');

  it('keeps the decimals the storage column can hold instead of the granularity of the bands', () => {
    expect(scoredValue(leakage, 55, 1000)).toBe(0.055);
    expect(scoredValue(leakage, 54, 1000)).toBe(0.054);
    expect(scoredValue(leakage, 45, 1000)).toBe(0.045);
  });

  it('rounds a quotient longer than the column to four decimals', () => {
    expect(scoredValue(leakage, 1, 3)).toBe(0.3333);
    expect(scoredValue(leakage, 2, 3)).toBe(0.6667);
  });

  it('leaves a single-component value at the precision it was entered with', () => {
    expect(scoredValue(metric('MTTD — Defect'), 3.5, null)).toBe(3.5);
    expect(scoredValue(metric('MTTD — Defect'), 3.4, null)).toBe(3.4);
  });

  it('has no value while a component is missing or the denominator is zero', () => {
    expect(scoredValue(leakage, null, 200)).toBeNull();
    expect(scoredValue(leakage, 11, null)).toBeNull();
    expect(scoredValue(leakage, 11, 0)).toBeNull();
  });
});

describe.each(KPI_NORM_METRICS.map((m) => [m.name, m] as const))('%s', (_name, m) => {
  it('never lets one value match two bands at once', () => {
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
      .filter((r) => r.matched.length > 1)
      .map((r) => `${r.value} matched [${r.matched.join(', ')}]`);
    expect(offenders).toEqual([]);
  });

  it('gives every value a colour, including the ones no band claims', () => {
    const uncoloured = gridOf(m)
      .filter(
        (value) => computeEntryStatus(value, m.green_band, m.yellow_band, m.red_band) === null,
      )
      .map(String);
    expect(uncoloured).toEqual([]);
  });
});

describe('values that used to come back with no colour', () => {
  it('scores a leakage of 1 in 17 defects as amber', () => {
    expect(statusFor(metric('Defect Leakage'), 1, 17)).toBe('yellow');
  });

  it('scores a DRE of 189 in 200 defects as amber — 94.5% is short of the 95% green floor', () => {
    expect(statusFor(metric('Defect Removal Efficiency (DRE)'), 189, 200)).toBe('yellow');
  });

  it('scores 179 of 200 milestones on time as amber — 89.5% is short of the 90% green floor', () => {
    expect(statusFor(metric('On-time Delivery'), 179, 200)).toBe('yellow');
  });

  it('scores a busy rate of 32 in 40 hours as amber', () => {
    expect(statusFor(metric('Busy Rate'), 32, 40)).toBe('yellow');
  });

  it('scores a busy rate of 239 in 200 hours as red', () => {
    expect(statusFor(metric('Busy Rate'), 239, 200)).toBe('red');
  });
});

describe('a value is scored where it sits, not where rounding puts it', () => {
  it('keeps a lead time of 0.9 days green', () => {
    expect(statusFor(metric('Lead Time for Changes'), 0.9, null)).toBe('green');
  });

  it('keeps a production MTTR of 0.75 hours green', () => {
    expect(statusFor(metric('MTTR — Production'), 0.75, null)).toBe('green');
  });

  it('keeps an attrition of 955 leavers in 10000 heads green', () => {
    expect(statusFor(metric('Attrition Rate (rolling 12m)'), 955, 10000)).toBe('green');
  });

  it('stores a lead time to four decimals instead of whole days', () => {
    expect(scoredValue(metric('Lead Time for Changes'), 0.98765, null)).toBe(0.9877);
  });
});

describe('a value between two bands takes the worse of them', () => {
  it('scores a leakage of 54 in 1000 defects amber, not green', () => {
    expect(statusFor(metric('Defect Leakage'), 54, 1000)).toBe('yellow');
  });

  it('scores an SPI of 945 against 1000 planned amber, not green', () => {
    expect(statusFor(metric('Schedule Performance Index (SPI)'), 945, 1000)).toBe('yellow');
  });

  it('leaves a value sitting exactly on a band edge inside that band', () => {
    expect(statusFor(metric('Defect Leakage'), 50, 1000)).toBe('green');
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
