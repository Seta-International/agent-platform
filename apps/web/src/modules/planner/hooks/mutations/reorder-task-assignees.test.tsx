import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { PropsWithChildren } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { plannerKeys } from '../../state/query-keys';
import { useReorderTaskAssignees } from './reorder-task-assignees';

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

describe('useReorderTaskAssignees', () => {
  it('computes strictly ordered hints, sends them, and invalidates task', async () => {
    const captured = vi.fn<(body: Record<string, unknown>) => void>();
    server.use(
      http.put('/api/planner/v1/tasks/t1/assignees', async ({ request }) => {
        captured((await request.json()) as Record<string, unknown>);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { qc, Wrapper } = setup();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useReorderTaskAssignees(), { wrapper: Wrapper });

    result.current.mutate({
      task_id: 't1',
      newOrder: [{ user_id: 'u1' }, { user_id: 'u2' }, { user_id: 'u3' }],
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const body = captured.mock.calls[0]?.[0] as {
      assignees: Array<{ user_id: string; order_hint: string }>;
    };
    expect(body.assignees.map((a) => a.user_id)).toEqual(['u1', 'u2', 'u3']);
    expect(body.assignees[0]!.order_hint < body.assignees[1]!.order_hint).toBe(true);
    expect(body.assignees[1]!.order_hint < body.assignees[2]!.order_hint).toBe(true);

    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(plannerKeys.task('t1'));
  });
});
