import { beforeEach, describe, expect, it } from 'vitest';
import { _resetForTests, getNeighbors, setUserListOrder } from './user-list-order.ts';

describe('user-list-order', () => {
  beforeEach(() => _resetForTests());

  it('returns nulls when empty', () => {
    expect(getNeighbors('any')).toEqual({ prev: null, next: null });
  });

  it('returns prev/next when populated', () => {
    setUserListOrder(['a', 'b', 'c']);
    expect(getNeighbors('a')).toEqual({ prev: null, next: 'b' });
    expect(getNeighbors('b')).toEqual({ prev: 'a', next: 'c' });
    expect(getNeighbors('c')).toEqual({ prev: 'b', next: null });
  });

  it('returns nulls for unknown id', () => {
    setUserListOrder(['a', 'b']);
    expect(getNeighbors('z')).toEqual({ prev: null, next: null });
  });
});
