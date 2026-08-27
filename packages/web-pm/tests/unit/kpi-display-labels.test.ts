import { describe, expect, it } from 'vitest';
import {
  formatMetricValue,
  isoWeekLabel,
  SHORT_METRIC_LABELS,
  shortMetricLabel,
} from '../../src/pages/kpi-shared';

describe('formatMetricValue', () => {
  it('shows a lead time of 0.9 days as 0.9, never as 1', () => {
    expect(formatMetricValue(0.9, 'Lead Time for Changes', 1)).toBe('0.9');
  });

  it('keeps the decimals that decide the colour instead of rounding them away', () => {
    expect(formatMetricValue(0.996, 'Lead Time for Changes', 1)).toBe('0.996');
    expect(formatMetricValue(0.0501, 'Defect Leakage', 2)).toBe('5.01%');
    expect(formatMetricValue(10.0909, 'Deployment Frequency', 2)).toBe('10.0909');
  });

  it('trims trailing zeros so a clean value still reads clean', () => {
    expect(formatMetricValue(0.05, 'Defect Leakage', 2)).toBe('5%');
    expect(formatMetricValue(7, 'Lead Time for Changes', 1)).toBe('7');
    expect(formatMetricValue(0.9, 'Defect Leakage', 2)).toBe('90%');
  });

  it('marks an unentered metric with the no-value middot', () => {
    expect(formatMetricValue(null, 'Lead Time for Changes', 1)).toBe('·');
  });
});

describe('isoWeekLabel', () => {
  it('formats the week as ISO 8601 — one hyphen, zero-padded week', () => {
    const current = { iso_year: 2026, iso_week: 32 };
    expect(isoWeekLabel(2026, 5, current)).toBe('2026-W05');
    expect(isoWeekLabel(2026, 31, current)).toBe('2026-W31');
  });

  it('marks the current week without reusing the "no value" middot', () => {
    const label = isoWeekLabel(2026, 32, { iso_year: 2026, iso_week: 32 });
    expect(label).toBe('2026-W32 (current)');
    expect(label).not.toContain('·');
  });
});

describe('shortMetricLabel', () => {
  it('never ends in an abbreviation dot — headers render uppercase', () => {
    for (const short of Object.values(SHORT_METRIC_LABELS)) {
      expect(short.endsWith('.'), `${short} would render as "${short.toUpperCase()}"`).toBe(false);
    }
  });

  it('falls back to the full metric name when the metric has no short form', () => {
    expect(shortMetricLabel('Defect Leakage')).toBe('Leakage');
    expect(shortMetricLabel('Utilization Rate')).toBe('Util');
    expect(shortMetricLabel('Some Unlisted Metric')).toBe('Some Unlisted Metric');
  });
});
