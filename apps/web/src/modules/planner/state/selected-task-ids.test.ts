import { afterEach, describe, expect, it } from 'vitest';
import { useSelectedTaskIds } from './selected-task-ids';

afterEach(() => useSelectedTaskIds.getState().clear());

describe('useSelectedTaskIds', () => {
  it('toggle adds an id when not present', () => {
    useSelectedTaskIds.getState().toggle('task-1');
    expect(useSelectedTaskIds.getState().ids.has('task-1')).toBe(true);
  });

  it('toggle removes an id when already present', () => {
    useSelectedTaskIds.getState().toggle('task-1');
    useSelectedTaskIds.getState().toggle('task-1');
    expect(useSelectedTaskIds.getState().ids.has('task-1')).toBe(false);
  });

  it('selectAll replaces the set with the given ids', () => {
    useSelectedTaskIds.getState().toggle('old');
    useSelectedTaskIds.getState().selectAll(['a', 'b', 'c']);
    const { ids } = useSelectedTaskIds.getState();
    expect(ids.has('old')).toBe(false);
    expect([...ids].sort()).toEqual(['a', 'b', 'c']);
  });

  it('clear empties the set', () => {
    useSelectedTaskIds.getState().selectAll(['x', 'y']);
    useSelectedTaskIds.getState().clear();
    expect(useSelectedTaskIds.getState().ids.size).toBe(0);
  });

  it('set replaces the set with the provided Set instance', () => {
    useSelectedTaskIds.getState().selectAll(['old']);
    useSelectedTaskIds.getState().set(new Set(['p', 'q']));
    const { ids } = useSelectedTaskIds.getState();
    expect(ids.has('old')).toBe(false);
    expect([...ids].sort()).toEqual(['p', 'q']);
  });
});
