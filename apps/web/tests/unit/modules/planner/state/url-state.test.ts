import { describe, expect, it } from 'vitest';
import {
  parseDateKey,
  parseFiltersFromSearch,
  parseGroupBy,
  parseViewMode,
  serializeFiltersToSearch,
} from '../../../../../src/modules/planner/state/url-state';

describe('url-state', () => {
  it('parseFiltersFromSearch handles assignee + label multi-values', () => {
    expect(
      parseFiltersFromSearch({
        'filter.assignee': 'u1,u2',
        'filter.label': 'L1',
      }),
    ).toEqual({
      assignee_ids: ['u1', 'u2'],
      label_ids: ['L1'],
    });
  });

  it('serializeFiltersToSearch is the inverse', () => {
    const f = { assignee_ids: ['u1'], label_ids: ['L2'] };
    const s = serializeFiltersToSearch(f);
    expect(parseFiltersFromSearch(s)).toMatchObject({
      assignee_ids: ['u1'],
      label_ids: ['L2'],
    });
  });

  it('parseViewMode defaults to board', () => {
    expect(parseViewMode(undefined)).toBe('board');
    expect(parseViewMode('grid')).toBe('grid');
    expect(parseViewMode('foo')).toBe('board');
  });

  it('parseGroupBy defaults to bucket', () => {
    expect(parseGroupBy(undefined)).toBe('bucket');
    expect(parseGroupBy('assignee')).toBe('assignee');
    expect(parseGroupBy('foo')).toBe('bucket');
  });

  it('parseViewMode accepts calendar', () => {
    expect(parseViewMode('calendar')).toBe('calendar');
  });

  it('parseDateKey accepts YYYY-MM-DD only', () => {
    expect(parseDateKey('2026-06-01')).toBe('2026-06-01');
    expect(parseDateKey('2026-6-1')).toBeUndefined();
    expect(parseDateKey('garbage')).toBeUndefined();
    expect(parseDateKey(undefined)).toBeUndefined();
  });
});
