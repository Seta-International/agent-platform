import { describe, expect, it } from 'vitest';
import type { PerformanceCapacity } from '../../src/api/people-client.ts';
import { filterPerformanceNav, isPerformanceNavAllowed } from '../../src/nav/performance-nav.ts';

const tl: PerformanceCapacity = {
  kind: 'tl',
  project_id: 'p1',
  account_id: 'a1',
  label: 'Atlas',
};
const member: PerformanceCapacity = {
  kind: 'member',
  project_id: 'p2',
  account_id: 'a1',
  label: 'Neo',
};

function ids(roleSlugs: string[], capacity: PerformanceCapacity | null): string[] {
  return filterPerformanceNav(roleSlugs, capacity).map((i) => i.id);
}

describe('filterPerformanceNav (AC1 affordance)', () => {
  it('PMO with no scoring capacity: Dashboard/Audit/Cycle show; Scoring/Self hidden', () => {
    const visible = ids(['pm.pmo'], null);
    expect(visible).toContain('dashboard');
    expect(visible).toContain('audit');
    expect(visible).toContain('cycle');
    expect(visible).toContain('history');
    expect(visible).not.toContain('scoring');
    expect(visible).not.toContain('self-assessment');
    expect(visible).not.toContain('morale');
    expect(visible).not.toContain('configuration');
  });

  it('TL capacity shows Scoring, hides Self-assessment', () => {
    const visible = ids(['people.viewer'], tl);
    expect(visible).toContain('scoring');
    expect(visible).not.toContain('self-assessment');
    expect(visible).toContain('morale');
  });

  it('Member capacity shows Self-assessment, hides Scoring', () => {
    const visible = ids(['people.viewer'], member);
    expect(visible).toContain('self-assessment');
    expect(visible).not.toContain('scoring');
  });

  it('people.manager sees Configuration + Audit + Cycle', () => {
    const visible = ids(['people.manager'], tl);
    expect(visible).toContain('configuration');
    expect(visible).toContain('audit');
    expect(visible).toContain('cycle');
  });

  it('isPerformanceNavAllowed mirrors the filter (beforeLoad helper)', () => {
    expect(isPerformanceNavAllowed('scoring', ['pm.pmo'], null)).toBe(false);
    expect(isPerformanceNavAllowed('audit', ['pm.pmo'], null)).toBe(true);
    expect(isPerformanceNavAllowed('scoring', [], tl)).toBe(true);
  });
});
