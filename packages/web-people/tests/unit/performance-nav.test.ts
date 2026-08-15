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

  it('Cycle unlock belongs to the organization view, not a delivery capacity', () => {
    expect(ids(performanceTopTabs({ capacity: null, canUnlock: true }))).toEqual([
      'reviews',
      'cycle',
    ]);
    // An org admin acting as an AM/TL/member is on their own delivery surface — a
    // company-wide PMO control has no business sitting next to their scorecard.
    expect(ids(performanceTopTabs({ capacity: am, canUnlock: true }))).toEqual([
      'reviews',
      'configuration',
    ]);
    expect(performanceTopTabs({ capacity: member, canUnlock: true })).toEqual([]);
    expect(performanceTopTabs({ capacity: tl, canUnlock: true })).toEqual([]);
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

  it('self-assessment is member; evaluating has no path of its own', () => {
    // An evaluation opens as a dialog over the dashboard, so the old /scoring page is
    // gone — a stale deep link falls back to Reviews rather than to an empty screen.
    expect(allowed('/people/performance/scoring', [], tl)).toBe(false);
    expect(allowed('/people/performance/self-assessment', [], member)).toBe(true);
    expect(allowed('/people/performance/self-assessment', [], tl)).toBe(false);
  });

  it('cycle unlock needs the permission AND the organization view', () => {
    expect(allowed('/people/performance/cycle', [], null, true)).toBe(true);
    // Switching into a delivery capacity leaves the org surface — the shell falls
    // back to Reviews rather than keeping a PMO control on a member's page.
    expect(allowed('/people/performance/cycle', [], member, true)).toBe(false);
    // A strategic role without people.performance.unlock still can't reach it.
    expect(allowed('/people/performance/cycle', ['people.manager'], tl, false)).toBe(false);
  });

  it('audit stays on the strategic roles', () => {
    expect(allowed('/people/performance/audit', ['pm.pmo'], null)).toBe(true);
    expect(allowed('/people/performance/audit', ['people.viewer'], tl)).toBe(false);
  });
});
