import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { PropsWithChildren } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { plannerKeys } from '../../state/query-keys';
import { useRemoveTaskReference } from './remove-task-reference';

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

describe('useRemoveTaskReference', () => {
  it('sends url in delete body and invalidates task + plan on success', async () => {
    const captured = vi.fn<(body: Record<string, unknown>) => void>();
    server.use(
      http.delete('/api/planner/v1/tasks/t1/references', async ({ request }) => {
        captured((await request.json()) as Record<string, unknown>);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { qc, Wrapper } = setup();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useRemoveTaskReference('p1'), { wrapper: Wrapper });

    result.current.mutate({ task_id: 't1', url: 'https://x' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(captured.mock.calls[0]?.[0]).toEqual({ url: 'https://x' });
    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(plannerKeys.task('t1'));
    expect(keys).toContainEqual(plannerKeys.plan('p1'));
  });
});
