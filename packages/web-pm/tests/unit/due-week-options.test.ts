import { describe, expect, it } from 'vitest';
import {
  dueWeekOptions,
  isoWeekBaseOfDateString,
  isoWeekEndDate,
  lastIsoWeekOf,
} from '../../src/pages/kpi-shared';

describe('lastIsoWeekOf', () => {
  it('gives 53 to a year that starts on a Thursday', () => {
    expect(lastIsoWeekOf(2026)).toBe(53);
  });

  it('gives 52 to years that do not', () => {
    expect(lastIsoWeekOf(2025)).toBe(52);
    expect(lastIsoWeekOf(2027)).toBe(52);
  });
});

describe('isoWeekEndDate', () => {
  it('lands on the week’s Sunday', () => {
    expect(isoWeekEndDate(2026, 34)).toBe('2026-08-23');
    expect(isoWeekEndDate(2026, 52)).toBe('2026-12-27');
  });

  it('carries a final week that spills into January', () => {
    expect(isoWeekEndDate(2026, 53)).toBe('2027-01-03');
  });
});

describe('dueWeekOptions', () => {
  it('starts the week after the report and runs to the end of the ISO year', () => {
    const options = dueWeekOptions({ iso_year: 2026, iso_week: 33 });

    expect(options[0]?.label).toBe('2026-W34');
    expect(options.at(-1)?.label).toBe('2026-W53');
    expect(options).toHaveLength(20);
  });

  it('carries the week’s end date as the value the report stores', () => {
    const options = dueWeekOptions({ iso_year: 2026, iso_week: 33 });

    expect(options[0]?.value).toBe('2026-08-23');
  });

  it('never offers the week being reported on, or one behind it', () => {
    const labels = dueWeekOptions({ iso_year: 2026, iso_week: 33 }).map((o) => o.label);

    expect(labels).not.toContain('2026-W33');
    expect(labels).not.toContain('2026-W32');
  });

  it('rolls into the next year rather than stranding the last week of a year', () => {
    const options = dueWeekOptions({ iso_year: 2026, iso_week: 53 });

    expect(options[0]?.label).toBe('2027-W01');
    expect(options.at(-1)?.label).toBe('2027-W52');
  });
});

describe('isoWeekBaseOfDateString', () => {
  it('reads a stored due date back as the week it falls in', () => {
    expect(isoWeekBaseOfDateString('2026-08-23')).toBe('2026-W34');
  });

  it('keeps a mid-week date in its own week', () => {
    expect(isoWeekBaseOfDateString('2026-08-19')).toBe('2026-W34');
  });

  it('reads a date the composer never offered — an older report — without shifting it', () => {
    expect(isoWeekBaseOfDateString('2027-01-03')).toBe('2026-W53');
  });
});
