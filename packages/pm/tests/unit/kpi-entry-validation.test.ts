import { describe, expect, it } from 'vitest';
import { KPI_NORM_METRICS } from '../../src/backend/domain/kpi-norm-data.ts';
import { type KpiEntryRules, kpiComponentIssue, validateKpiEntry } from '../../src/contracts.ts';

const rulesFor = (name: string): KpiEntryRules => {
  const m = KPI_NORM_METRICS.find((x) => x.name === name);
  if (!m) throw new Error(`no metric named ${name}`);
  return m;
};

const COUNT_RATIO = rulesFor('Defect Leakage');
const DENSITY = rulesFor('Internal Defect Density');
const SIGNED = rulesFor('Risk Identification Lead Time');
const SCORE = rulesFor('eNPS / CSS');
const MARGIN = rulesFor('Margin');
const UTILIZATION = rulesFor('Utilization Rate');

describe('validateKpiEntry — storage limits', () => {
  it('accepts the widest value numeric(15,4) can hold', () => {
    expect(validateKpiEntry(DENSITY, 99_999_999_999, 1).component_1).toBeNull();
    expect(validateKpiEntry(UTILIZATION, 1234.5678, 1).component_1).toBeNull();
  });

  it('rejects a value wider than the column instead of letting it 500 on insert', () => {
    expect(validateKpiEntry(DENSITY, 1e30, 1).component_1).toBe('Max 11 digits');
    expect(validateKpiEntry(DENSITY, 100_000_000_000, 1).component_1).toBe('Max 11 digits');
  });

  it('rejects more decimals than the column keeps, rather than rounding silently', () => {
    expect(validateKpiEntry(UTILIZATION, 1.23456, 1).component_1).toBe('Max 4 decimals');
  });
});

describe('validateKpiEntry — per-metric rules', () => {
  it('leaves an untouched entry alone', () => {
    expect(validateKpiEntry(COUNT_RATIO, null, null)).toEqual({
      component_1: null,
      component_2: null,
    });
  });

  it('requires whole numbers where the metric counts things', () => {
    expect(validateKpiEntry(COUNT_RATIO, 2.6, 20).component_1).toBe('Whole number only');
    expect(validateKpiEntry(COUNT_RATIO, 2, 20).component_1).toBeNull();
    expect(validateKpiEntry(COUNT_RATIO, 2, 20.5).component_2).toBe('Whole number only');
  });

  it('leaves decimals alone where the figure is effort, money or a rate', () => {
    expect(validateKpiEntry(UTILIZATION, 37.5, 40).component_1).toBeNull();
    expect(validateKpiEntry(DENSITY, 8, 20.5).component_2).toBeNull();
  });

  it('rejects a negative reading on a counting metric', () => {
    expect(validateKpiEntry(COUNT_RATIO, -1, 20).component_1).toBe("Can't be negative");
    expect(validateKpiEntry(COUNT_RATIO, 1, -20).component_2).toBe("Can't be negative");
  });

  it('lets Margin go negative — a loss-making project is exactly what Red is for', () => {
    expect(validateKpiEntry(MARGIN, -5000, 20000).component_1).toBeNull();
  });

  it('holds a bounded metric to its own range', () => {
    expect(validateKpiEntry(SCORE, 4.3, null).component_1).toBeNull();
    expect(validateKpiEntry(SCORE, 5, null).component_1).toBeNull();
    expect(validateKpiEntry(SCORE, 0, null).component_1).toBe('Enter 1 to 5');
    expect(validateKpiEntry(SCORE, 5.1, null).component_1).toBe('Enter 1 to 5');
  });

  it('lets a lead time read below zero, within its own range', () => {
    expect(validateKpiEntry(SIGNED, -12, null).component_1).toBeNull();
    expect(validateKpiEntry(SIGNED, -49, null).component_1).toBeNull();
    expect(validateKpiEntry(SIGNED, -50, null).component_1).toBe('Enter -49 to 49');
    expect(validateKpiEntry(SIGNED, 50, null).component_1).toBe('Enter -49 to 49');
    expect(validateKpiEntry(SIGNED, 1.5, null).component_1).toBe('Whole number only');
  });
});

describe('validateKpiEntry — the pair', () => {
  it('rejects a zero denominator', () => {
    expect(validateKpiEntry(COUNT_RATIO, 5, 0).component_2).toBe("Can't be 0");
  });

  it('marks the other box required once one is filled', () => {
    expect(validateKpiEntry(COUNT_RATIO, 5, null).component_2).toBe('Required');
    expect(validateKpiEntry(COUNT_RATIO, null, 20).component_1).toBe('Required');
  });

  it('ignores the second box on a single-component metric', () => {
    expect(validateKpiEntry(SIGNED, 5, 0).component_2).toBeNull();
  });

  it('caps a share metric at its own total', () => {
    expect(validateKpiEntry(COUNT_RATIO, 21, 20).component_1).toBe("Can't exceed Total defects");
    expect(validateKpiEntry(COUNT_RATIO, 20, 20).component_1).toBeNull();
  });

  it('lets a rate metric run past 100% — its bands score that on purpose', () => {
    expect(validateKpiEntry(UTILIZATION, 45, 40).component_1).toBeNull();
  });

  it('caps Margin at revenue while still allowing a loss', () => {
    expect(validateKpiEntry(MARGIN, 25000, 20000).component_1).toBe("Can't exceed Revenue");
    expect(validateKpiEntry(MARGIN, -5000, 20000).component_1).toBeNull();
  });
});

describe('kpiComponentIssue — what is wrong with one box alone', () => {
  it('reports only the box own faults, never the pair disagreeing', () => {
    expect(kpiComponentIssue(COUNT_RATIO, 1, 60)).toBeNull();
    expect(validateKpiEntry(COUNT_RATIO, 60, 20).component_1).toBe("Can't exceed Total defects");
  });

  it('still reports a figure that is wrong whatever the other box holds', () => {
    expect(kpiComponentIssue(COUNT_RATIO, 1, 2.6)).toBe('Whole number only');
    expect(kpiComponentIssue(COUNT_RATIO, 1, -1)).toBe("Can't be negative");
    expect(kpiComponentIssue(COUNT_RATIO, 1, 1e30)).toBe('Max 11 digits');
    expect(kpiComponentIssue(COUNT_RATIO, 2, 0)).toBe("Can't be 0");
  });

  it('never speaks for a box the metric does not have', () => {
    expect(kpiComponentIssue(SIGNED, 2, 0)).toBeNull();
  });
});

describe('the norm catalogue itself', () => {
  it('gives every metric a coherent rule set', () => {
    for (const m of KPI_NORM_METRICS) {
      if (m.component_count === 1) {
        expect(m.is_share, `${m.name} is 1-component and cannot be a share`).toBe(false);
        expect(m.component_2_integer, `${m.name} has no second box`).toBe(false);
      }
      if (m.component_1_min !== null && m.component_1_max !== null) {
        expect(m.component_1_min, `${m.name} range is inverted`).toBeLessThan(m.component_1_max);
      }
    }
  });

  it('keeps the shape the entry screen was specified against', () => {
    const count = (pred: (m: (typeof KPI_NORM_METRICS)[number]) => boolean) =>
      KPI_NORM_METRICS.filter(pred).length;
    expect(KPI_NORM_METRICS).toHaveLength(44);
    expect(count((m) => m.component_1_integer)).toBe(22);
    expect(count((m) => m.component_2_integer)).toBe(16);
    expect(count((m) => m.is_share)).toBe(19);
    expect(count((m) => m.component_1_min === null || m.component_1_min < 0)).toBe(2);
  });
});
