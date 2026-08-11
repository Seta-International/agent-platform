import { describe, expect, it } from 'vitest';
import type { PerformanceCapacity } from '../../src/api/people-client.ts';
import {
  amTopTabs,
  isPerformanceNavAllowed,
  isPerformancePathAllowed,
} from '../../src/nav/performance-nav.ts';

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

describe('amTopTabs', () => {
  it('AM gets Reviews + Configuration; other capacities get none', () => {
    expect(amTopTabs(am).map((t) => t.id)).toEqual(['reviews', 'configuration']);
    expect(amTopTabs(tl)).toEqual([]);
    expect(amTopTabs(member)).toEqual([]);
    expect(amTopTabs(null)).toEqual([]);
  });
});

describe('isPerformancePathAllowed', () => {
  it('home is always allowed; configuration is AM-only', () => {
    expect(isPerformancePathAllowed('/people/performance', ['pm.pmo'], null)).toBe(true);
    expect(isPerformancePathAllowed('/people/performance/configuration', [], am)).toBe(true);
    expect(isPerformancePathAllowed('/people/performance/configuration', [], tl)).toBe(false);
  });

  it('scoring is TL/AM; self-assessment is member', () => {
    expect(isPerformancePathAllowed('/people/performance/scoring', [], tl)).toBe(true);
    expect(isPerformancePathAllowed('/people/performance/scoring', [], member)).toBe(false);
    expect(isPerformancePathAllowed('/people/performance/self-assessment', [], member)).toBe(true);
    expect(isPerformancePathAllowed('/people/performance/self-assessment', [], tl)).toBe(false);
  });

  it('audit/cycle are strategic roles', () => {
    expect(isPerformancePathAllowed('/people/performance/audit', ['pm.pmo'], null)).toBe(true);
    expect(isPerformancePathAllowed('/people/performance/cycle', ['people.manager'], tl)).toBe(
      true,
    );
    expect(isPerformancePathAllowed('/people/performance/audit', ['people.viewer'], tl)).toBe(
      false,
    );
  });

  it('isPerformanceNavAllowed mirrors path checks', () => {
    expect(isPerformanceNavAllowed('scoring', ['pm.pmo'], null)).toBe(false);
    expect(isPerformanceNavAllowed('audit', ['pm.pmo'], null)).toBe(true);
    expect(isPerformanceNavAllowed('scoring', [], tl)).toBe(true);
    expect(isPerformanceNavAllowed('configuration', [], am)).toBe(true);
  });
});
