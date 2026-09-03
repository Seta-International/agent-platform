import { describe, expect, it } from 'vitest';
import {
  dueDateFloor,
  formatDueDate,
  formatReportedOn,
  isoWeekEndDate,
} from '../../src/pages/kpi-shared';

describe('isoWeekEndDate', () => {
  it('lands on the week’s Sunday', () => {
    expect(isoWeekEndDate(2026, 34)).toBe('2026-08-23');
    expect(isoWeekEndDate(2026, 52)).toBe('2026-12-27');
  });

  it('carries a final week that spills into January', () => {
    expect(isoWeekEndDate(2026, 53)).toBe('2027-01-03');
  });
});

describe('dueDateFloor', () => {
  it('opens on the Monday after the week being reported on', () => {
    expect(dueDateFloor({ iso_year: 2026, iso_week: 32 })).toBe('2026-08-10');
  });

  it('leaves no day of the reported week selectable', () => {
    const floor = dueDateFloor({ iso_year: 2026, iso_week: 32 });

    expect(floor > isoWeekEndDate(2026, 32)).toBe(true);
    expect(new Date(floor).getUTCDay()).toBe(1);
  });

  it('crosses the year boundary rather than stranding the last week of a year', () => {
    expect(dueDateFloor({ iso_year: 2026, iso_week: 53 })).toBe('2027-01-04');
    expect(dueDateFloor({ iso_year: 2026, iso_week: 52 })).toBe('2026-12-28');
  });
});

describe('formatDueDate', () => {
  it('reads a stored due date back as day, short month, year', () => {
    expect(formatDueDate('2026-11-13')).toBe('13 Nov 2026');
    expect(formatDueDate('2026-09-30')).toBe('30 Sep 2026');
  });

  it('keeps the stored day whatever the viewer’s timezone', () => {
    expect(formatDueDate('2026-01-01')).toBe('1 Jan 2026');
    expect(formatDueDate('2026-12-31')).toBe('31 Dec 2026');
  });
});

describe('formatReportedOn', () => {
  it('prints a report timestamp in the same shape as a due date', () => {
    expect(formatReportedOn('2026-08-13T09:00:00.000Z')).toBe('13 Aug 2026');
  });
});
