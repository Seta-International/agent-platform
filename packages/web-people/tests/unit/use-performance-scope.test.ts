import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PerformanceCapacity } from '../../src/api/people-client.ts';
import { usePerformanceScope } from '../../src/hooks/use-performance-scope.ts';

const navigate = vi.fn();
let searchState: Record<string, unknown> = {};

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useSearch: () => searchState,
}));

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

describe('usePerformanceScope', () => {
  beforeEach(() => {
    searchState = {};
    navigate.mockReset();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('bare URL resolves to default capacity and writes search (AC4)', async () => {
    const { result } = renderHook(() =>
      usePerformanceScope({
        pathname: '/people/performance',
        capacities: [tlA, memberB],
        default_capacity_index: 0,
        can_view_org: false,
        as_of_month: '2026-07',
      }),
    );

    expect(result.current.resolved.capacity).toEqual(tlA);
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(navigate.mock.calls.some((c) => c[0]?.search?.kind === 'tl')).toBe(true);
  });

  it('bare URL restores sessionStorage before writing default (AC4 dual-role)', async () => {
    sessionStorage.setItem(
      'people.performance.context',
      JSON.stringify({
        kind: 'member',
        project: 'proj-b',
        account: 'acct-2',
        month: '2026-07',
      }),
    );

    renderHook(() =>
      usePerformanceScope({
        pathname: '/people/performance',
        capacities: [tlA, memberB],
        default_capacity_index: 0,
        can_view_org: false,
        as_of_month: '2026-07',
      }),
    );

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    // First navigate must restore Member, not clobber with default TL.
    expect(navigate.mock.calls[0]?.[0]?.search).toEqual(
      expect.objectContaining({
        kind: 'member',
        project: 'proj-b',
        account: 'acct-2',
        month: '2026-07',
      }),
    );
    const wroteDefaultTlFirst = navigate.mock.calls.some(
      (c, i) => i === 0 && c[0]?.search?.kind === 'tl' && c[0]?.search?.project === 'proj-a',
    );
    expect(wroteDefaultTlFirst).toBe(false);
  });

  it('explicit URL wins over sessionStorage (AC4)', async () => {
    sessionStorage.setItem(
      'people.performance.context',
      JSON.stringify({ kind: 'tl', project: 'proj-a', account: 'acct-1', month: '2026-07' }),
    );
    searchState = {
      kind: 'member',
      project: 'proj-b',
      account: 'acct-2',
      month: '2026-07',
    };

    const { result } = renderHook(() =>
      usePerformanceScope({
        pathname: '/people/performance',
        capacities: [tlA, memberB],
        default_capacity_index: 0,
        can_view_org: false,
        as_of_month: '2026-07',
      }),
    );

    expect(result.current.resolved.capacity).toEqual(memberB);
    // Should not overwrite with stored TL
    await waitFor(() => {
      const overwroteWithTl = navigate.mock.calls.some(
        (c) => c[0]?.search?.kind === 'tl' && c[0]?.search?.project === 'proj-a',
      );
      expect(overwroteWithTl).toBe(false);
    });
  });

  it('setCapacity patches URL search (AC2/AC3)', () => {
    searchState = {
      kind: 'tl',
      project: 'proj-a',
      account: 'acct-1',
      month: '2026-07',
    };
    const { result } = renderHook(() =>
      usePerformanceScope({
        pathname: '/people/performance/scoring',
        capacities: [tlA, memberB],
        default_capacity_index: 0,
        can_view_org: false,
        as_of_month: '2026-07',
      }),
    );

    result.current.setCapacity(memberB);
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        search: expect.objectContaining({
          kind: 'member',
          project: 'proj-b',
        }),
        replace: true,
      }),
    );
  });

  it('setOrg patches URL search to the organization view (FUT-781)', () => {
    searchState = { kind: 'tl', project: 'proj-a', account: 'acct-1', month: '2026-07' };
    const { result } = renderHook(() =>
      usePerformanceScope({
        pathname: '/people/performance',
        capacities: [tlA, memberB],
        default_capacity_index: 0,
        can_view_org: true,
        as_of_month: '2026-07',
      }),
    );

    result.current.setOrg();
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        search: expect.objectContaining({ view: 'organization', kind: undefined }),
        replace: true,
      }),
    );
  });
});
