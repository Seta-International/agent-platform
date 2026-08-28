import { describe, expect, it } from 'vitest';
import type { PerformanceCapacity } from '../../src/api/people-client.ts';
import { isPerformancePathAllowed, performanceTopTabs } from '../../src/nav/performance-nav.ts';

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
const am: PerformanceCapacity = { kind: 'am', account_id: 'a1', label: 'Contoso' };

const ids = (tabs: readonly { id: string }[]) => tabs.map((t) => t.id);

describe('performanceTopTabs', () => {
  it('AM gets Reviews + Configuration; other capacities get none', () => {
    expect(ids(performanceTopTabs({ capacity: am, canUnlock: false }))).toEqual([
      'reviews',
      'configuration',
    ]);
    expect(performanceTopTabs({ capacity: tl, canUnlock: false })).toEqual([]);
    expect(performanceTopTabs({ capacity: member, canUnlock: false })).toEqual([]);
    expect(performanceTopTabs({ capacity: null, canUnlock: false })).toEqual([]);
  });

  it('unlock permission adds a Cycle unlock tab, even with no delivery capacity', () => {
    expect(ids(performanceTopTabs({ capacity: null, canUnlock: true }))).toEqual([
      'reviews',
      'cycle',
    ]);
    expect(ids(performanceTopTabs({ capacity: am, canUnlock: true }))).toEqual([
      'reviews',
      'configuration',
      'cycle',
    ]);
  });
});

describe('isPerformancePathAllowed', () => {
  const allowed = (
    pathname: string,
    roleSlugs: readonly string[],
    capacity: PerformanceCapacity | null,
    canUnlock = false,
  ) => isPerformancePathAllowed({ pathname, roleSlugs, capacity, canUnlock });

  it('home is always allowed; configuration is AM-only', () => {
    expect(allowed('/people/performance', ['pm.pmo'], null)).toBe(true);
    expect(allowed('/people/performance/configuration', [], am)).toBe(true);
    expect(allowed('/people/performance/configuration', [], tl)).toBe(false);
  });

  it('scoring is TL/AM; self-assessment is member', () => {
    expect(allowed('/people/performance/scoring', [], tl)).toBe(true);
    expect(allowed('/people/performance/scoring', [], member)).toBe(false);
    expect(allowed('/people/performance/self-assessment', [], member)).toBe(true);
    expect(allowed('/people/performance/self-assessment', [], tl)).toBe(false);
  });

  it('cycle unlock follows the permission, not the role list', () => {
    expect(allowed('/people/performance/cycle', [], null, true)).toBe(true);
    // A strategic role without people.performance.unlock still can't reach it.
    expect(allowed('/people/performance/cycle', ['people.manager'], tl, false)).toBe(false);
  });

  it('audit stays on the strategic roles', () => {
    expect(allowed('/people/performance/audit', ['pm.pmo'], null)).toBe(true);
    expect(allowed('/people/performance/audit', ['people.viewer'], tl)).toBe(false);
  });
});
