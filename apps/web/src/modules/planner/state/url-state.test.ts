import { describe, expect, it } from 'vitest';
import {
  parseFiltersFromSearch,
  parseGroupBy,
  parseViewMode,
  serializeFiltersToSearch,
} from './url-state';

describe('url-state', () => {
  it('parseFiltersFromSearch handles assignee + label + skill multi-values', () => {
    expect(
      parseFiltersFromSearch({
        'filter.assignee': 'u1,u2',
        'filter.label': 'L1',
        'filter.skill': 'backend,ai',
      }),
    ).toEqual({
      assignee_ids: ['u1', 'u2'],
      label_ids: ['L1'],
      skill_tags: ['backend', 'ai'],
    });
  });

  it('serializeFiltersToSearch is the inverse', () => {
    const f = { assignee_ids: ['u1'], label_ids: [], skill_tags: ['react'] };
    const s = serializeFiltersToSearch(f);
    expect(parseFiltersFromSearch(s)).toMatchObject({
      assignee_ids: ['u1'],
      skill_tags: ['react'],
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
});
