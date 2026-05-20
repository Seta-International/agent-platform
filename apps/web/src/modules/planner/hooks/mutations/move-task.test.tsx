import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { PropsWithChildren } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { plannerKeys } from '../../state/query-keys';
import { useMoveTask } from './move-task';

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
    priority: 'medium',
    progress: 'not_started',
    review_state: null,
    skill_tags: [],
    due_at: null,
    sort_order: 1_000_000,
    created_by: 'u',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    version: 3,
    assignees: [],
    labels: [],
    checklist_summary: { total: 0, checked: 0 },
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
        HttpResponse.json(baseTask({ bucket_id: 'b2', sort_order: 1_500_000, version: 4 })),
      ),
    );
    const { qc, Wrapper } = setup();
    const { result } = renderHook(() => useMoveTask('p1'), { wrapper: Wrapper });

    result.current.mutate({ task_id: 't1', expected_version: 3, to_bucket_id: 'b2' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const tasks = qc.getQueryData<Array<{ bucket_id: string; version: number }>>(
      plannerKeys.planTasks('p1', { plan_id: 'p1' }),
    )!;
    expect(tasks[0]!.bucket_id).toBe('b2');
    expect(tasks[0]!.version).toBe(4);
  });

  it('rolls back + does not advance version on 409 CONFLICT', async () => {
    server.use(
      http.post('/api/planner/v1/tasks/t1/move', () =>
        HttpResponse.json({ error: 'CONFLICT', current_version: 5 }, { status: 409 }),
      ),
    );
    const { qc, Wrapper } = setup();
    const { result } = renderHook(() => useMoveTask('p1'), { wrapper: Wrapper });

    result.current.mutate({ task_id: 't1', expected_version: 3, to_bucket_id: 'b2' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const tasks = qc.getQueryData<Array<{ bucket_id: string; version: number }>>(
      plannerKeys.planTasks('p1', { plan_id: 'p1' }),
    )!;
    expect(tasks[0]!.bucket_id).toBe('b1');
    expect(tasks[0]!.version).toBe(3);
  });
});
