import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { PropsWithChildren } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { plannerKeys } from '../../state/query-keys';
import { useTaskDetail } from './use-task-detail';

const TASK = {
  id: 't1',
  tenant_id: 't',
  plan_id: 'p1',
  bucket_id: 'b1',
  title: 'A task',
  description: 'desc',
  priority_number: 5,
  percent_complete: 25,
  is_deferred: false,
  preview_type: 'automatic',
  review_state: null,
  skill_tags: [],
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
  assignees: [
    {
      user_id: 'u1',
      display_name: 'Alice',
      email: 'a@x',
      availability_status: 'available',
      ooo_until: null,
      deactivated_at: null,
    },
  ],
  labels: [],
  checklist_summary: { total: 2, checked: 1 },
};

const server = setupServer(http.get('*/api/planner/v1/tasks/t1', () => HttpResponse.json(TASK)));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe('useTaskDetail', () => {
  it('resolves the task with embedded assignees and checklist_summary', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTaskDetail('t1'), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.id).toBe('t1');
    expect(result.current.data?.assignees).toHaveLength(1);
    expect(result.current.data?.checklist_summary).toEqual({ total: 2, checked: 1 });
  });

  it('caches under plannerKeys.task(taskId)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTaskDetail('t1'), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(qc.getQueryData(plannerKeys.task('t1'))).toEqual(TASK);
  });
});
