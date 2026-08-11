import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHitlDecision } from '../../../src/hooks/use-hitl-decision';

function assignCard(opts: { itemOrder: string[] }) {
  return {
    details: [
      {
        kind: 'entityList',
        select: 'single',
        items: opts.itemOrder.map((id) => ({ id, primary: id === 'u1' })),
      },
    ],
    // The PERSISTED order, which alternateIndex addresses. Deliberately not the
    // same order as the display items above.
    primary: { argsPatch: { assigneeUserIds: ['u1'] } },
    alternates: [
      { argsPatch: { assigneeUserIds: ['u2'] } },
      { argsPatch: { assigneeUserIds: ['u3'] } },
    ],
  };
}

describe('useHitlDecision — branch selection', () => {
  it('seeds on the primary item and reports the primary branch', () => {
    const { result } = renderHook(() =>
      useHitlDecision(assignCard({ itemOrder: ['u1', 'u2'] }) as never),
    );
    expect(result.current.selectedIds).toEqual(['u1']);
    expect(result.current.branch).toEqual({ chosen: 'primary' });
  });

  it('reports the alternate index of the picked candidate', () => {
    const { result } = renderHook(() =>
      useHitlDecision(assignCard({ itemOrder: ['u1', 'u2', 'u3'] }) as never),
    );
    act(() => result.current.toggle('u3'));
    expect(result.current.branch).toEqual({ chosen: 'alternate', alternateIndex: 1 });
  });

  // THE test. `details.items` is display order and may be re-sorted; alternates
  // is the persisted array alternateIndex addresses. Mapping by position would
  // assign the wrong person and nothing downstream could tell.
  it('maps by identity, not by display position', () => {
    const { result } = renderHook(() =>
      useHitlDecision(assignCard({ itemOrder: ['u3', 'u2', 'u1'] }) as never),
    );
    act(() => result.current.toggle('u3'));
    expect(result.current.branch).toEqual({ chosen: 'alternate', alternateIndex: 1 });
  });

  it('reports no branch when the selection matches none — never a silent primary', () => {
    const { result } = renderHook(() =>
      useHitlDecision({
        details: [{ kind: 'entityList', select: 'single', items: [{ id: 'ghost' }] }],
        primary: { argsPatch: { assigneeUserIds: ['u1'] } },
        alternates: [],
      } as never),
    );
    act(() => result.current.toggle('ghost'));
    expect(result.current.branch).toBeNull();
  });

  // A card with no rows to pick from — create, update, link, merge, A2 assign.
  // Its primary button means primary; its alternates are their own buttons and
  // supply their own index.
  it('reports the primary branch for a card with no entityList', () => {
    const { result } = renderHook(() =>
      useHitlDecision({
        details: [{ kind: 'kvTable', rows: [] }],
        primary: { argsPatch: { action: 'create' } },
        alternates: [{ argsPatch: { action: 'use_existing' } }],
      } as never),
    );
    expect(result.current.branch).toEqual({ chosen: 'primary' });
  });
});
