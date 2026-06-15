import type { MyTasksResult, TaskWithPlan } from '@seta/planner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { PropsWithChildren } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { useMyTasks } from '../../../../../../src/modules/planner/hooks/queries/use-my-tasks';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function taskWithPlan(over: Partial<TaskWithPlan>): TaskWithPlan {
  return {
    id: 't',
    tenant_id: 't',
    plan_id: 'p',
    bucket_id: null,
    title: '',
    description: null,
    description_text: null,
    priority_number: 5,
    percent_complete: 0,
    is_deferred: false,
    preview_type: 'automatic',
    review_state: null,
    start_at: null,
    due_at: null,
    order_hint: null,
    assignee_priority: null,
    external_source: 'native',
    external_id: null,
    external_etag: null,
    external_synced_at: null,
    sync_status: 'idle',
    last_error: null,
    created_by: 'u',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    version: 1,
    plan: { id: 'p', name: 'Plan', group_id: 'g' },
    assignees: [],
    labels: [],
    ...over,
  };
}

function emptyResult(): MyTasksResult {
  return { late: [], dueThisWeek: [], inProgress: [], notStarted: [], recentlyCompleted: [] };
}

function Wrapper({ children }: PropsWithChildren) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useMyTasks', () => {
  it('returns the sectioned payload from the server', async () => {
    server.use(
      http.get('*/api/planner/v1/my-tasks', () =>
        HttpResponse.json({
          ...emptyResult(),
          late: [taskWithPlan({ id: 'L1' }), taskWithPlan({ id: 'L2' })],
        }),
      ),
    );
    const { result } = renderHook(() => useMyTasks({}), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.late).toHaveLength(2);
  });

  it('forwards filters to the HTTP wrapper as query-string params', async () => {
    let search = '';
    server.use(
      http.get('*/api/planner/v1/my-tasks', ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json(emptyResult());
      }),
    );
    const { result } = renderHook(
      () => useMyTasks({ planId: 'p1', priority: 1, sort: 'due_at', search: 'cache' }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const sp = new URLSearchParams(search);
    expect(sp.get('planId')).toBe('p1');
    expect(sp.get('priority')).toBe('1');
    expect(sp.get('sort')).toBe('due_at');
    expect(sp.get('q')).toBe('cache');
  });

  it('cache is keyed by filters (different filters → different cache entries)', async () => {
    server.use(http.get('*/api/planner/v1/my-tasks', () => HttpResponse.json(emptyResult())));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function W({ children }: PropsWithChildren) {
      return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    }
    const { result: r1 } = renderHook(() => useMyTasks({ planId: 'p1' }), { wrapper: W });
    const { result: r2 } = renderHook(() => useMyTasks({ planId: 'p2' }), { wrapper: W });
    await waitFor(() => expect(r1.current.isSuccess).toBe(true));
    await waitFor(() => expect(r2.current.isSuccess).toBe(true));
    const keys = qc
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    const myTasksKeys = keys.filter((k) => Array.isArray(k) && k[1] === 'myTasks');
    expect(myTasksKeys).toHaveLength(2);
  });
});
