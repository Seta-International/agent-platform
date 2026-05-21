import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { PropsWithChildren } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useCreateTask } from './create-task';

const server = setupServer();
beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return { qc, Wrapper };
}

describe('useCreateTask', () => {
  it('forwards start_at, priority_number, and preview_type when provided', async () => {
    const captured = vi.fn();
    server.use(
      http.post('/api/planner/v1/tasks', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        captured(body);
        return HttpResponse.json({
          id: 't-new',
          tenant_id: 't',
          plan_id: 'p1',
          bucket_id: 'b1',
          title: body.title,
          description: null,
          priority_number: body.priority_number ?? 5,
          percent_complete: 0,
          is_deferred: false,
          preview_type: body.preview_type ?? 'automatic',
          review_state: null,
          skill_tags: [],
          start_at: body.start_at ?? null,
          due_at: null,
          order_hint: null,
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
        });
      }),
    );
    const { Wrapper } = setup();
    const { result } = renderHook(() => useCreateTask('p1'), { wrapper: Wrapper });

    result.current.mutate({
      plan_id: 'p1',
      bucket_id: 'b1',
      title: 'Build it',
      start_at: '2026-06-01',
      priority_number: 1,
      preview_type: 'checklist',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(captured).toHaveBeenCalledTimes(1);
    expect(captured.mock.calls[0]![0]).toMatchObject({
      title: 'Build it',
      bucket_id: 'b1',
      start_at: '2026-06-01',
      priority_number: 1,
      preview_type: 'checklist',
    });
  });
});
