import { describe, expect, it } from 'vitest';
import type { PerformanceCapacity } from '../../src/api/people-client.ts';
import { performanceKeys } from '../../src/state/performance-query-keys.ts';
import {
  capacityLabel,
  capacityOptionId,
  hasExplicitScope,
  parsePerformanceSearch,
  resolvePerformanceScope,
  scopeTuple,
  searchFromCapacity,
} from '../../src/state/performance-scope.ts';

const tlA: PerformanceCapacity = {
  kind: 'tl',
  project_id: 'proj-a',
  account_id: 'acct-1',
  label: 'Atlas',
};
const memberB: PerformanceCapacity = {
  kind: 'member',
  project_id: 'proj-b',
  account_id: 'acct-2',
  label: 'Neo',
};
const memberC: PerformanceCapacity = {
  kind: 'member',
  project_id: 'proj-c',
  account_id: 'acct-2',
  label: 'Orion',
};
const amX: PerformanceCapacity = {
  kind: 'am',
  account_id: 'acct-x',
  label: 'Acme',
};

describe('performance-scope', () => {
  it('labels capacities for the switcher control', () => {
    expect(capacityLabel(tlA)).toBe('TL · Atlas');
    expect(capacityLabel(memberB)).toBe('Member · Neo');
    expect(capacityLabel(amX)).toBe('AM · Acme');
  });

  it('builds stable option ids', () => {
    expect(capacityOptionId(tlA)).toBe('tl:proj-a');
    expect(capacityOptionId(memberB)).toBe('member:proj-b');
    expect(capacityOptionId(amX)).toBe('am:acct-x');
  });

  it('parsePerformanceSearch coerces kind/month and drops junk (AC4)', () => {
    expect(
      parsePerformanceSearch({
        kind: 'tl',
        project: 'proj-a',
        account: 'acct-1',
        month: '2026-07',
        noise: 1,
      }),
    ).toEqual({
      kind: 'tl',
      project: 'proj-a',
      account: 'acct-1',
      month: '2026-07',
    });
    expect(parsePerformanceSearch({ kind: 'nope', month: '07-2026' })).toEqual({
      kind: undefined,
      account: undefined,
      project: undefined,
      month: undefined,
    });
  });

  it('dual-role: TL·A then Member·B resolve independently (AC2)', () => {
    const capacities = [tlA, memberB];
    const asTl = resolvePerformanceScope({
      search: { kind: 'tl', project: 'proj-a', account: 'acct-1', month: '2026-07' },
      capacities,
      default_capacity_index: 0,
      as_of_month: '2026-07',
    });
    expect(asTl.resolved.capacity).toEqual(tlA);
    expect(asTl.corrected).toBe(false);

    const asMember = resolvePerformanceScope({
      search: { kind: 'member', project: 'proj-b', account: 'acct-2', month: '2026-07' },
      capacities,
      default_capacity_index: 0,
      as_of_month: '2026-07',
    });
    expect(asMember.resolved.capacity).toEqual(memberB);
  });

  it('multi-project member switching project changes the slice (AC3)', () => {
    const capacities = [memberB, memberC];
    const neo = resolvePerformanceScope({
      search: { kind: 'member', project: 'proj-b', month: '2026-07' },
      capacities,
      default_capacity_index: 0,
      as_of_month: '2026-07',
    });
    expect(neo.resolved.capacity?.label).toBe('Neo');

    const orion = resolvePerformanceScope({
      search: { kind: 'member', project: 'proj-c', month: '2026-07' },
      capacities,
      default_capacity_index: 0,
      as_of_month: '2026-07',
    });
    expect(orion.resolved.capacity?.label).toBe('Orion');
  });

  it('forged / unknown capacity falls back to default (do not trust URL)', () => {
    const result = resolvePerformanceScope({
      search: { kind: 'tl', project: 'forged', month: '2026-07' },
      capacities: [tlA, memberB],
      default_capacity_index: 0,
      as_of_month: '2026-07',
    });
    expect(result.resolved.capacity).toEqual(tlA);
    expect(result.corrected).toBe(true);
  });

  it('empty capacities → organization mode (PMO)', () => {
    const result = resolvePerformanceScope({
      search: {},
      capacities: [],
      default_capacity_index: -1,
      as_of_month: '2026-07',
    });
    expect(result.resolved).toEqual({ mode: 'organization', month: '2026-07', capacity: null });
  });

  it('explicit view=organization resolves to org mode for an org-viewer WITH capacities (FUT-781)', () => {
    const result = resolvePerformanceScope({
      search: { view: 'organization', month: '2026-07' },
      capacities: [tlA, memberB],
      default_capacity_index: 0,
      as_of_month: '2026-07',
      can_view_org: true,
    });
    expect(result.resolved).toEqual({ mode: 'organization', month: '2026-07', capacity: null });
    expect(result.corrected).toBe(false);
  });

  it('view=organization is ignored without permission — falls back to a capacity (no leak)', () => {
    const result = resolvePerformanceScope({
      search: { view: 'organization', month: '2026-07' },
      capacities: [tlA, memberB],
      default_capacity_index: 0,
      as_of_month: '2026-07',
      can_view_org: false,
    });
    expect(result.resolved.mode).toBe('capacity');
    expect(result.resolved.capacity).toEqual(tlA);
    expect(result.corrected).toBe(true);
  });

  it('parses and detects the organization view param', () => {
    expect(parsePerformanceSearch({ view: 'organization', month: '2026-07' })).toEqual({
      kind: undefined,
      account: undefined,
      project: undefined,
      month: '2026-07',
      view: 'organization',
    });
    expect(hasExplicitScope({ view: 'organization' })).toBe(true);
  });

  it('bare URL has no explicit scope; searchFromCapacity fills defaults', () => {
    expect(hasExplicitScope({})).toBe(false);
    expect(searchFromCapacity(tlA, '2026-07')).toEqual({
      kind: 'tl',
      project: 'proj-a',
      account: 'acct-1',
      month: '2026-07',
    });
  });
});

describe('performance-query-keys (AC2 — no cross-role merge)', () => {
  it('tl+A and member+B produce distinct section keys', () => {
    const tlScope = resolvePerformanceScope({
      search: searchFromCapacity(tlA, '2026-07'),
      capacities: [tlA, memberB],
      default_capacity_index: 0,
      as_of_month: '2026-07',
    }).resolved;
    const memberScope = resolvePerformanceScope({
      search: searchFromCapacity(memberB, '2026-07'),
      capacities: [tlA, memberB],
      default_capacity_index: 0,
      as_of_month: '2026-07',
    }).resolved;

    expect(performanceKeys.section('dashboard', tlScope)).not.toEqual(
      performanceKeys.section('dashboard', memberScope),
    );
    expect(scopeTuple(tlScope)).toEqual({
      kind: 'tl',
      project: 'proj-a',
      account: 'acct-1',
      month: '2026-07',
    });
    expect(scopeTuple(memberScope)).toEqual({
      kind: 'member',
      project: 'proj-b',
      account: 'acct-2',
      month: '2026-07',
    });
  });
});
