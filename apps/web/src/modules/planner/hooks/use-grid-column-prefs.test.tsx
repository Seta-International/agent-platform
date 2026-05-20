import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useGridColumnPrefs } from './use-grid-column-prefs';

const DEFAULT_ORDER = ['title', 'status', 'bucket', 'assignees', 'priority', 'due', 'labels'];

beforeEach(() => localStorage.clear());

describe('useGridColumnPrefs', () => {
  it('returns default prefs when localStorage is empty', () => {
    const { result } = renderHook(() => useGridColumnPrefs('plan-1'));
    const [prefs] = result.current;
    expect(prefs.order).toEqual(DEFAULT_ORDER);
    expect(prefs.widths).toEqual({});
  });

  it('persists updated prefs to localStorage under the keyed slot', async () => {
    const { result } = renderHook(() => useGridColumnPrefs('plan-2'));
    const [, setPrefs] = result.current;

    await act(async () => {
      setPrefs({ order: ['status', 'title'], widths: { title: 240 } });
    });

    const stored = localStorage.getItem('planner.grid.columns.plan-2');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.order).toEqual(['status', 'title']);
    expect(parsed.widths).toEqual({ title: 240 });
  });

  it('isolates storage by planId', async () => {
    const { result: r1 } = renderHook(() => useGridColumnPrefs('plan-A'));
    const { result: r2 } = renderHook(() => useGridColumnPrefs('plan-B'));

    await act(async () => {
      r1.current[1]({ order: ['due', 'title'], widths: {} });
    });

    // plan-B hook state is unaffected by plan-A's mutation.
    const [prefsB] = r2.current;
    expect(prefsB.order).toEqual(DEFAULT_ORDER);

    // plan-A's slot reflects the custom order; plan-B's slot is independent.
    const storedA = localStorage.getItem('planner.grid.columns.plan-A');
    const storedB = localStorage.getItem('planner.grid.columns.plan-B');
    expect(JSON.parse(storedA!).order).toEqual(['due', 'title']);
    expect(JSON.parse(storedB!).order).toEqual(DEFAULT_ORDER);
  });

  it('hydrates from existing localStorage on mount', () => {
    localStorage.setItem(
      'planner.grid.columns.plan-3',
      JSON.stringify({ order: ['priority', 'due'], widths: { priority: 100 } }),
    );

    const { result } = renderHook(() => useGridColumnPrefs('plan-3'));
    const [prefs] = result.current;
    expect(prefs.order).toEqual(['priority', 'due']);
    expect(prefs.widths).toEqual({ priority: 100 });
  });
});
