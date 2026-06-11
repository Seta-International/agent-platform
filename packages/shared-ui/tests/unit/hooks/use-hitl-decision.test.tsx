import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHitlDecision } from '../../../src/hooks/use-hitl-decision';

const card = {
  details: [
    {
      kind: 'entityList',
      select: 'multi',
      items: [
        { id: 'u1', type: 'user', label: 'Alice', primary: true },
        { id: 'u2', type: 'user', label: 'Bob' },
      ],
    },
  ],
};

describe('useHitlDecision', () => {
  it('seeds selection from the primary entity and derives an approve decision', () => {
    const { result } = renderHook(() => useHitlDecision(card as never));
    expect(result.current.selectedIds).toEqual(['u1']);
    expect(result.current.toDecision('approve')).toEqual({
      decision: 'approve',
      overrideUserIds: ['u1'],
    });
  });

  it('multi-select toggles produce a modify decision when changed from the primary', () => {
    const { result } = renderHook(() => useHitlDecision(card as never));
    act(() => result.current.toggle('u2'));
    expect(result.current.selectedIds.sort()).toEqual(['u1', 'u2']);
    expect(result.current.dirty).toBe(true);
    expect(result.current.toDecision('approve')).toEqual({
      decision: 'modify',
      overrideUserIds: ['u1', 'u2'],
    });
  });
});
