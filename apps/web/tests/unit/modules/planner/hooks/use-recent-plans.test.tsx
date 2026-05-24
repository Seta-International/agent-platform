import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useRecentPlans } from '../../../../../src/modules/planner/hooks/use-recent-plans';

beforeEach(() => localStorage.clear());

describe('useRecentPlans', () => {
  it('returns empty list when localStorage is empty', () => {
    const { result } = renderHook(() => useRecentPlans('tenant-1'));
    expect(result.current.recents).toEqual([]);
  });

  it('records a visit and persists under the tenant-keyed slot', async () => {
    const { result } = renderHook(() => useRecentPlans('tenant-1'));

    await act(async () => {
      result.current.recordVisit('plan-a', 'Q3 Launch');
    });

    expect(result.current.recents).toHaveLength(1);
    const first = result.current.recents[0]!;
    expect(first).toMatchObject({ planId: 'plan-a', planName: 'Q3 Launch' });
    expect(typeof first.visitedAt).toBe('number');

    const stored = JSON.parse(localStorage.getItem('planner.recents.tenant-1')!);
    expect(stored[0]).toMatchObject({ planId: 'plan-a', planName: 'Q3 Launch' });
  });

  it('bumps an existing plan to the front when revisited and updates the name', async () => {
    const { result } = renderHook(() => useRecentPlans('tenant-1'));

    await act(async () => {
      result.current.recordVisit('plan-a', 'Old name');
      result.current.recordVisit('plan-b', 'Platform reliability');
      result.current.recordVisit('plan-a', 'New name');
    });

    expect(result.current.recents.map((r) => r.planId)).toEqual(['plan-a', 'plan-b']);
    expect(result.current.recents[0]!.planName).toBe('New name');
  });

  it('caps the list at 5 entries, evicting the oldest', async () => {
    const { result } = renderHook(() => useRecentPlans('tenant-1'));

    await act(async () => {
      for (let i = 0; i < 7; i++) result.current.recordVisit(`plan-${i}`, `Plan ${i}`);
    });

    expect(result.current.recents).toHaveLength(5);
    expect(result.current.recents.map((r) => r.planId)).toEqual([
      'plan-6',
      'plan-5',
      'plan-4',
      'plan-3',
      'plan-2',
    ]);
  });

  it('evicts a plan by id', async () => {
    const { result } = renderHook(() => useRecentPlans('tenant-1'));

    await act(async () => {
      result.current.recordVisit('plan-a', 'A');
      result.current.recordVisit('plan-b', 'B');
      result.current.evict('plan-a');
    });

    expect(result.current.recents.map((r) => r.planId)).toEqual(['plan-b']);
  });

  it('isolates storage by tenantId', async () => {
    const { result: r1 } = renderHook(() => useRecentPlans('tenant-A'));
    const { result: r2 } = renderHook(() => useRecentPlans('tenant-B'));

    await act(async () => {
      r1.current.recordVisit('plan-x', 'X');
    });

    expect(r2.current.recents).toEqual([]);
    expect(JSON.parse(localStorage.getItem('planner.recents.tenant-A')!)).toHaveLength(1);
    expect(localStorage.getItem('planner.recents.tenant-B')).toBeNull();
  });

  it('hydrates from existing localStorage on mount', () => {
    localStorage.setItem(
      'planner.recents.tenant-1',
      JSON.stringify([{ planId: 'plan-z', planName: 'Z', visitedAt: 1000 }]),
    );

    const { result } = renderHook(() => useRecentPlans('tenant-1'));
    expect(result.current.recents).toEqual([{ planId: 'plan-z', planName: 'Z', visitedAt: 1000 }]);
  });

  it('returns empty when localStorage throws on read', () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('SecurityError');
    };
    try {
      const { result } = renderHook(() => useRecentPlans('tenant-1'));
      expect(result.current.recents).toEqual([]);
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
