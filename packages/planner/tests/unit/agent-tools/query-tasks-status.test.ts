import { describe, expect, it } from 'vitest';
import { statusToPercentFilters } from '../../../src/backend/agent-tools/query-tasks.ts';

describe('statusToPercentFilters', () => {
  it('open = percent < 100', () => {
    expect(statusToPercentFilters('open')).toEqual({ percent_complete_lt: 100 });
  });

  it('not_started = percent < 50 (captures 0)', () => {
    expect(statusToPercentFilters('not_started')).toEqual({ percent_complete_lt: 50 });
  });

  it('in_progress = 50 <= percent < 100 (captures 50)', () => {
    expect(statusToPercentFilters('in_progress')).toEqual({
      percent_complete_gte: 50,
      percent_complete_lt: 100,
    });
  });

  it('completed = percent >= 100', () => {
    expect(statusToPercentFilters('completed')).toEqual({ percent_complete_gte: 100 });
  });

  it('any = no percent filter', () => {
    expect(statusToPercentFilters('any')).toEqual({});
  });
});
