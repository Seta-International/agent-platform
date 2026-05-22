import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { PropsWithChildren } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { plannerKeys } from '../../state/query-keys';
import { useRefreshPlanSync } from './refresh-plan-sync';
import { useResolvePlanConflicts } from './resolve-plan-conflicts';

const PLAN_ID = 'p1';

const server = setupServer(
  http.post(`*/api/planner/v1/plans/${PLAN_ID}/refresh-sync`, () =>
    HttpResponse.json({ ok: true }),
  ),
  http.post(`*/api/planner/v1/plans/${PLAN_ID}/resolve-conflicts`, () =>
    HttpResponse.json({ applied: 1 }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return { qc, Wrapper, invalidate };
}

describe('useRefreshPlanSync', () => {
  it('on success, invalidates planSyncStatus and plan', async () => {
    const { Wrapper, invalidate } = makeWrapper();
    const { result } = renderHook(() => useRefreshPlanSync(PLAN_ID), { wrapper: Wrapper });

    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: plannerKeys.planSyncStatus(PLAN_ID) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: plannerKeys.plan(PLAN_ID) });
  });
});

describe('useResolvePlanConflicts', () => {
  it('on success, invalidates planConflicts, planSyncStatus, and plan', async () => {
    const { Wrapper, invalidate } = makeWrapper();
    const { result } = renderHook(() => useResolvePlanConflicts(PLAN_ID), { wrapper: Wrapper });

    act(() => result.current.mutate([{ kind: 'plan', field: 'name', choice: 'local' as const }]));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: plannerKeys.planConflicts(PLAN_ID) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: plannerKeys.planSyncStatus(PLAN_ID) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: plannerKeys.plan(PLAN_ID) });
  });
});
