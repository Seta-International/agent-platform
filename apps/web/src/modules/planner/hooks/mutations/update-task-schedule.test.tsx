import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { PropsWithChildren } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { plannerKeys } from '../../state/query-keys';
import { useUpdateTaskSchedule } from './update-task-schedule';

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

describe('useUpdateTaskSchedule', () => {
  it('sends start_at + due_at and invalidates task + plan on success', async () => {
    const captured = vi.fn<(body: Record<string, unknown>) => void>();
    server.use(
      http.patch('/api/planner/v1/tasks/t1', async ({ request }) => {
        captured((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ id: 't1', version: 4 });
      }),
    );

    const { qc, Wrapper } = setup();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateTaskSchedule('p1'), { wrapper: Wrapper });

    result.current.mutate({
      task_id: 't1',
      expected_version: 3,
      start_at: '2026-06-01T00:00:00Z',
      due_at: '2026-06-15T00:00:00Z',
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(captured.mock.calls[0]?.[0]).toEqual({
      expected_version: 3,
      patch: { start_at: '2026-06-01T00:00:00Z', due_at: '2026-06-15T00:00:00Z' },
    });
    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(plannerKeys.task('t1'));
    expect(keys).toContainEqual(plannerKeys.plan('p1'));
  });

  it('passes null to clear schedule fields', async () => {
    const captured = vi.fn<(body: Record<string, unknown>) => void>();
    server.use(
      http.patch('/api/planner/v1/tasks/t1', async ({ request }) => {
        captured((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ id: 't1', version: 4 });
      }),
    );

    const { Wrapper } = setup();
    const { result } = renderHook(() => useUpdateTaskSchedule('p1'), { wrapper: Wrapper });

    result.current.mutate({ task_id: 't1', expected_version: 3, due_at: null });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(captured.mock.calls[0]?.[0]).toEqual({
      expected_version: 3,
      patch: { due_at: null },
    });
  });
});
