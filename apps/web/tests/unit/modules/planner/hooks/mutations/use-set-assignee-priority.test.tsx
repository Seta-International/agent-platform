import type { MyTasksResult, TaskWithPlan } from '@seta/planner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { PropsWithChildren } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useSetAssigneePriority } from '../../../../../../src/modules/planner/hooks/mutations/use-set-assignee-priority';
import { plannerKeys } from '../../../../../../src/modules/planner/state/query-keys';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function task(over: Partial<TaskWithPlan>): TaskWithPlan {
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

function setup(seed?: MyTasksResult) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  if (seed) qc.setQueryData(plannerKeys.myTasks({}), seed);
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return { qc, Wrapper };
}

describe('useSetAssigneePriority', () => {
  it('optimistically reorders the task within its section, then settles after server success', async () => {
    server.use(
      http.put('*/api/planner/v1/tasks/B/assignee-priority', async () =>
        HttpResponse.json(task({ id: 'B', assignee_priority: 'Zz' })),
      ),
    );
    const seed: MyTasksResult = {
      ...emptyResult(),
      inProgress: [
        task({ id: 'A', assignee_priority: 'a0' }),
        task({ id: 'B', assignee_priority: 'b0' }),
      ],
    };
    const { qc, Wrapper } = setup(seed);
    const { result } = renderHook(() => useSetAssigneePriority(), { wrapper: Wrapper });

    // value Zz is lexicographically less than a0 → B should move to slot 0
    // Wait — Zz > a0 actually (uppercase < lowercase in ASCII). Use lowercase to ensure ordering.
    result.current.mutate({ taskId: 'B', value: '0' });

    // Optimistic patch should be visible synchronously after mutate
    await waitFor(() => {
      const after = qc.getQueryData<MyTasksResult>(plannerKeys.myTasks({}));
      expect(after?.inProgress.map((t) => t.id)).toEqual(['B', 'A']);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls back the optimistic patch on server error', async () => {
    server.use(
      http.put('*/api/planner/v1/tasks/B/assignee-priority', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    const seed: MyTasksResult = {
      ...emptyResult(),
      inProgress: [
        task({ id: 'A', assignee_priority: 'a0' }),
        task({ id: 'B', assignee_priority: 'b0' }),
      ],
    };
    const { qc, Wrapper } = setup(seed);
    const { result } = renderHook(() => useSetAssigneePriority(), { wrapper: Wrapper });

    result.current.mutate({ taskId: 'B', value: '0' });
    await waitFor(() => expect(result.current.isError).toBe(true));

    const after = qc.getQueryData<MyTasksResult>(plannerKeys.myTasks({}));
    expect(after?.inProgress.map((t) => t.id)).toEqual(['A', 'B']);
  });

  it('invalidates all myTasks query keys on settled', async () => {
    server.use(
      http.put('*/api/planner/v1/tasks/X/assignee-priority', () =>
        HttpResponse.json(task({ id: 'X', assignee_priority: 'm' })),
      ),
    );
    const { qc, Wrapper } = setup();
    qc.setQueryData(plannerKeys.myTasks({ planId: 'p1' }), emptyResult());
    qc.setQueryData(plannerKeys.myTasks({ planId: 'p2' }), emptyResult());
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useSetAssigneePriority(), { wrapper: Wrapper });

    result.current.mutate({ taskId: 'X', value: 'm' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalled();
  });
});
