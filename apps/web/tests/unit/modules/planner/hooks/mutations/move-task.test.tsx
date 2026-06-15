import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { PropsWithChildren } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { useMoveTask } from '../../../../../../src/modules/planner/hooks/mutations/move-task';
import { plannerKeys } from '../../../../../../src/modules/planner/state/query-keys';

const server = setupServer();
beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

function baseTask(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    tenant_id: 't',
    plan_id: 'p1',
    bucket_id: 'b1',
    title: 'x',
    description: null,
    priority_number: 5,
    percent_complete: 0,
    is_deferred: false,
    preview_type: 'automatic',
    review_state: null,
    start_at: null,
    due_at: null,
    order_hint: 'a',
    assignee_priority: null,
    external_source: 'native',
    external_id: null,
    external_etag: null,
    external_synced_at: null,
    created_by: 'u',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    version: 3,
    assignees: [],
    labels: [],
    checklist_summary: { total: 0, checked: 0 },
    checklist_preview: [],
    reference_preview: [],
    ...over,
  };
}

function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  qc.setQueryData(plannerKeys.planTasks('p1', { plan_id: 'p1' }), [baseTask()]);
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return { qc, Wrapper };
}

describe('useMoveTask', () => {
  it('moves the task optimistically + commits server version on success', async () => {
    server.use(
      http.post('/api/planner/v1/tasks/t1/move', () =>
        HttpResponse.json(baseTask({ bucket_id: 'b2', order_hint: 'm', version: 4 })),
      ),
    );
    const { qc, Wrapper } = setup();
    const { result } = renderHook(() => useMoveTask('p1'), { wrapper: Wrapper });

    result.current.mutate({ task_id: 't1', expected_version: 3, bucket_id: 'b2' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const tasks = qc.getQueryData<Array<{ bucket_id: string; version: number }>>(
      plannerKeys.planTasks('p1', { plan_id: 'p1' }),
    )!;
    expect(tasks[0]!.bucket_id).toBe('b2');
    expect(tasks[0]!.version).toBe(4);
  });

  it('rolls back the move on 409 CONFLICT and reconciles cached version to the server value so the next attempt sends a fresh expected_version', async () => {
    server.use(
      http.post('/api/planner/v1/tasks/t1/move', () =>
        HttpResponse.json(
          { error: 'CONFLICT', message: 'Version mismatch', details: { current_version: 5 } },
          { status: 409 },
        ),
      ),
    );
    const { qc, Wrapper } = setup();
    const { result } = renderHook(() => useMoveTask('p1'), { wrapper: Wrapper });

    result.current.mutate({ task_id: 't1', expected_version: 3, bucket_id: 'b2' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const tasks = qc.getQueryData<Array<{ bucket_id: string; version: number }>>(
      plannerKeys.planTasks('p1', { plan_id: 'p1' }),
    )!;
    // Optimistic move rolled back, but version reconciled forward so the user
    // can immediately retry the drag without hitting the same 409.
    expect(tasks[0]!.bucket_id).toBe('b1');
    expect(tasks[0]!.version).toBe(5);
  });
});
