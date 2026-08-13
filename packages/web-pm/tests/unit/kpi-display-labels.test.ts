import { describe, expect, it } from 'vitest';
import { isoWeekLabel, SHORT_METRIC_LABELS, shortMetricLabel } from '../../src/pages/kpi-shared';

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
