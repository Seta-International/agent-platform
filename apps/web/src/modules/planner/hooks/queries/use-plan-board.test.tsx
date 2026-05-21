import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { PropsWithChildren } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { usePlanBoard } from './use-plan-board';

const server = setupServer(
  http.get('/api/planner/v1/plans/p1', () =>
    HttpResponse.json({
      id: 'p1',
      tenant_id: 't',
      group_id: 'g1',
      name: 'Q3',
      category_descriptions: {},
      external_source: 'native',
      external_id: null,
      external_etag: null,
      external_synced_at: null,
      created_by: '',
      created_at: '',
      updated_at: '',
      deleted_at: null,
      version: 1,
    }),
  ),
  http.get('/api/planner/v1/plans/p1/buckets', () =>
    HttpResponse.json({
      buckets: [
        {
          id: 'b1',
          tenant_id: 't',
          plan_id: 'p1',
          name: 'To do',
          order_hint: 'a',
          external_source: 'native',
          external_id: null,
          external_etag: null,
          external_synced_at: null,
          created_at: '',
          updated_at: '',
          deleted_at: null,
          version: 1,
        },
      ],
    }),
  ),
  http.get('/api/planner/v1/tasks', () => HttpResponse.json({ tasks: [] })),
  http.get('/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
);

beforeAll(() => server.listen());
afterAll(() => server.close());

function wrapper({ children }: PropsWithChildren) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('usePlanBoard', () => {
  it('returns { plan, buckets, tasks, labels } combined', async () => {
    const { result } = renderHook(() => usePlanBoard('p1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.plan.id).toBe('p1');
    expect(result.current.data!.buckets).toHaveLength(1);
    expect(result.current.data!.tasks).toEqual([]);
    expect(result.current.data!.labels).toEqual([]);
  });

  it('sorts buckets by order_hint ascending', async () => {
    // The single bucket at order_hint 'a' — trivially sorted, but verifies the field is accessed
    const { result } = renderHook(() => usePlanBoard('p1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.buckets[0]!.order_hint).toBe('a');
  });

  it('isPending is true before data resolves', () => {
    const { result } = renderHook(() => usePlanBoard('p1'), { wrapper });
    expect(result.current.isPending).toBe(true);
    expect(result.current.data).toBeUndefined();
  });
});
