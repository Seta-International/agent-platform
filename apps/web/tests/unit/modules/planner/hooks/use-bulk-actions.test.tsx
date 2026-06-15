import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useBulkActions } from '../../../../../src/modules/planner/hooks/use-bulk-actions';

const server = setupServer();
beforeAll(() => server.listen());
afterAll(() => server.close());
beforeEach(() => server.resetHandlers());

describe('useBulkActions', () => {
  it('moves a multi-task selection + aggregates partial failure', async () => {
    const okIds = new Set(['t1', 't2']);
    const failIds = new Set(['t3']);
    server.use(
      http.post('/api/planner/v1/tasks/:id/move', ({ params }) => {
        const id = String(params.id);
        if (failIds.has(id)) {
          return HttpResponse.json(
            {
              error: 'FORBIDDEN',
              message: 'Missing permission: planner.task.update',
              details: { permission: 'planner.task.update', group_id: 'g1' },
            },
            { status: 403 },
          );
        }
        return HttpResponse.json({
          id,
          tenant_id: 'ten1',
          plan_id: 'p1',
          bucket_id: 'b2',
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
          created_by: 'u1',
          created_at: '2026-05-21',
          updated_at: '2026-05-21',
          deleted_at: null,
          version: 2,
        });
      }),
    );

    // silence the unused variable warning — okIds is used implicitly via the Set complement
    void okIds;

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useBulkActions('p1'), { wrapper });

    let r!: Awaited<ReturnType<typeof result.current.bulkMove>>;
    await act(async () => {
      r = await result.current.bulkMove({
        tasks: [
          { id: 't1', expected_version: 1 },
          { id: 't2', expected_version: 1 },
          { id: 't3', expected_version: 1 },
        ],
        to_bucket_id: 'b2',
      });
    });

    expect(r.ok).toBe(2);
    expect(r.failed).toBe(1);
    expect(r.failedPermissions).toEqual([{ taskId: 't3', permission: 'planner.task.update' }]);
  });
});
