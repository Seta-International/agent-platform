import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { PropsWithChildren } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { plannerKeys } from '../../state/query-keys';
import { useSetCategoryDescriptions } from './set-category-descriptions';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return { qc, Wrapper };
}

describe('useSetCategoryDescriptions', () => {
  it('sends slots and invalidates planCategories + plan on success', async () => {
    const captured = vi.fn<(body: Record<string, unknown>) => void>();
    server.use(
      http.put('/api/planner/v1/plans/p1/categories', async ({ request }) => {
        captured((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ id: 'p1', version: 2 });
      }),
    );

    const { qc, Wrapper } = setup();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useSetCategoryDescriptions('p1'), { wrapper: Wrapper });

    result.current.mutate({ slots: { 1: { name: 'Frontend' }, 2: { name: 'Backend' } } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(captured.mock.calls[0]?.[0]).toEqual({
      slots: { '1': { name: 'Frontend' }, '2': { name: 'Backend' } },
    });
    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(plannerKeys.planCategories('p1'));
    expect(keys).toContainEqual(plannerKeys.plan('p1'));
  });
});
