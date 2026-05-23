import { describe, expect, it } from 'vitest';
import {
  parseMyTasksSearch,
  serializeMyTasksSearch,
} from '../../../../../src/modules/planner/state/my-tasks-url-state';
import type { MyTasksFilters } from '../../../../../src/modules/planner/state/query-keys';

describe('my-tasks-url-state', () => {
  it('parses an empty location into defaults', () => {
    expect(parseMyTasksSearch({})).toEqual({ view: 'list', sort: 'assignee_priority' });
  });

  it('round-trips a populated filter through URL search params', () => {
    const f: MyTasksFilters = {
      planId: 'p1',
      priority: 1,
      due: 'overdue',
      view: 'grid',
      sort: 'due_at',
      search: 'cache',
    };
    expect(parseMyTasksSearch(serializeMyTasksSearch(f))).toEqual(f);
  });

  it('drops invalid priority values', () => {
    expect(parseMyTasksSearch({ priority: '7' })).toEqual({
      view: 'list',
      sort: 'assignee_priority',
    });
  });

  it('drops invalid due value', () => {
    expect(parseMyTasksSearch({ due: 'tomorrow' })).toEqual({
      view: 'list',
      sort: 'assignee_priority',
    });
  });

  it('omits defaults from serialized output', () => {
    expect(serializeMyTasksSearch({ view: 'list', sort: 'assignee_priority' })).toEqual({});
  });
});
