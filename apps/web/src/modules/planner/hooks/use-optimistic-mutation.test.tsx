import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSavingIds } from '../state/saving-ids';
import { useOptimisticMutation } from './use-optimistic-mutation';

function wrapWith(qc: QueryClient) {
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useOptimisticMutation', () => {
  it('applies optimistic state, registers savingId, rolls back on error', async () => {
    const qc = new QueryClient();
    qc.setQueryData(['x'], { v: 1 });

    const mutationFn = vi.fn().mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(
      () =>
        useOptimisticMutation<{ id: string }, void>({
          mutationFn,
          snapshot: (_v, q) => [{ key: ['x'], prev: q.getQueryData(['x']) }],
          applyOptimistic: (_v, q) => q.setQueryData(['x'], { v: 2 }),
          onServerOk: () => {},
          savingId: (v) => v.id,
          invalidate: () => [['x']],
          errorMessage: () => 'failed',
        }),
      { wrapper: wrapWith(qc) },
    );

    await act(async () => {
      await result.current.mutateAsync({ id: 't1' }).catch(() => {});
    });

    expect(qc.getQueryData(['x'])).toEqual({ v: 1 });
    expect(useSavingIds.getState().ids.has('t1')).toBe(false);
  });

  it('commits optimistic state on success and removes savingId', async () => {
    const qc = new QueryClient();
    qc.setQueryData(['x'], { v: 1 });

    const mutationFn = vi.fn().mockResolvedValueOnce({ v: 3 });

    const { result } = renderHook(
      () =>
        useOptimisticMutation<{ id: string }, { v: number }>({
          mutationFn,
          snapshot: (_v, q) => [{ key: ['x'], prev: q.getQueryData(['x']) }],
          applyOptimistic: (_v, q) => q.setQueryData(['x'], { v: 2 }),
          onServerOk: (server, _v, q) => q.setQueryData(['x'], server),
          savingId: (v) => v.id,
          invalidate: () => [['x']],
          errorMessage: () => '',
        }),
      { wrapper: wrapWith(qc) },
    );

    await act(async () => {
      await result.current.mutateAsync({ id: 't1' });
    });

    expect(qc.getQueryData(['x'])).toEqual({ v: 3 });
    expect(useSavingIds.getState().ids.has('t1')).toBe(false);
  });
});
