import type { TaskWithAssigneesRow } from '@seta/planner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { PropsWithChildren } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { plannerKeys } from '../../state/query-keys';
import { useMoveToTopOfMyList } from './move-to-top-of-my-list';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function task(over: Partial<TaskWithAssigneesRow>): TaskWithAssigneesRow {
  return {
    id: 't',
    tenant_id: 't',
    plan_id: 'p',
    bucket_id: null,
    title: '',
    description: null,
    priority_number: 5,
    percent_complete: 0,
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
    version: 1,
    assignees: [],
    labels: [],
    checklist_summary: { total: 0, checked: 0 },
    ...over,
  };
}

function setup(seedTasks?: TaskWithAssigneesRow[]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  if (seedTasks) qc.setQueryData(plannerKeys.myAssigned(), seedTasks);
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return { qc, Wrapper };
}

describe('useMoveToTopOfMyList', () => {
  it('computes a hint less than the lowest in myAssigned cache and invalidates myAssigned', async () => {
    const captured = vi.fn<(body: Record<string, unknown>) => void>();
    server.use(
      http.put('/api/planner/v1/tasks/t1/assignee-priority', async ({ request }) => {
        captured((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ id: 't1', version: 2 });
      }),
    );

    const seed = [
      task({ id: 't2', assignee_priority: 'a1' }),
      task({ id: 't3', assignee_priority: 'a5' }),
      task({ id: 't1', assignee_priority: 'a9' }),
    ];
    const { qc, Wrapper } = setup(seed);
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useMoveToTopOfMyList(), { wrapper: Wrapper });

    result.current.mutate({ task_id: 't1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const body = captured.mock.calls[0]?.[0] as { value: string };
    expect(typeof body.value).toBe('string');
    expect(body.value < 'a1').toBe(true);

    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(plannerKeys.myAssigned());
  });

  it('falls back to a canonical first key when myAssigned cache is empty', async () => {
    const captured = vi.fn<(body: Record<string, unknown>) => void>();
    server.use(
      http.put('/api/planner/v1/tasks/t1/assignee-priority', async ({ request }) => {
        captured((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ id: 't1', version: 2 });
      }),
    );

    const { Wrapper } = setup();
    const { result } = renderHook(() => useMoveToTopOfMyList(), { wrapper: Wrapper });

    result.current.mutate({ task_id: 't1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const body = captured.mock.calls[0]?.[0] as { value: string };
    expect(typeof body.value).toBe('string');
    expect(body.value.length).toBeGreaterThan(0);
  });
});
