import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { PropsWithChildren } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useCreateTask } from '../../../../../../src/modules/planner/hooks/mutations/create-task';

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
  it('POSTs to /planner/v1/tasks then fires the planner.dedupOnCreate workflow', async () => {
    const taskCreate = vi.fn();
    const dedupStart = vi.fn();
    server.use(
      http.post('/api/planner/v1/tasks', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        taskCreate(body);
        return HttpResponse.json({ id: 'task-new', title: body.title as string, version: 1 });
      }),
      http.post('/api/agent/v1/workflows/runs/planner.dedupOnCreate/start', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        dedupStart(body);
        return HttpResponse.json({ runId: 'run-123' });
      }),
    );
    const { Wrapper } = setup();
    const { result } = renderHook(() => useCreateTask('p1'), { wrapper: Wrapper });

    result.current.mutate({
      plan_id: 'p1',
      bucket_id: 'b1',
      title: 'Build it',
      description: 'some desc',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(taskCreate).toHaveBeenCalledTimes(1);
    expect(taskCreate.mock.calls[0]![0]).toMatchObject({
      title: 'Build it',
      plan_id: 'p1',
      bucket_id: 'b1',
      description: 'some desc',
    });

    // The dedup workflow gets the *real* task id from step 1's response.
    expect(dedupStart).toHaveBeenCalledTimes(1);
    expect(dedupStart.mock.calls[0]![0]).toMatchObject({
      taskId: 'task-new',
      title: 'Build it',
      description: 'some desc',
      plan_id: 'p1',
    });
  });

  it('surfaces the server message when the task-create call fails', async () => {
    server.use(
      http.post('/api/planner/v1/tasks', () =>
        HttpResponse.json({ message: 'bucket_full' }, { status: 409 }),
      ),
    );
    const { Wrapper } = setup();
    const { result } = renderHook(() => useCreateTask('p1'), { wrapper: Wrapper });

    result.current.mutate({ plan_id: 'p1', title: 'Test' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('bucket_full');
  });

  it('still resolves successfully when the dedup workflow returns 500', async () => {
    // Dedup is best-effort — a failed start should NOT fail the create.
    server.use(
      http.post('/api/planner/v1/tasks', () =>
        HttpResponse.json({ id: 'task-new', title: 'x', version: 1 }),
      ),
      http.post('/api/agent/v1/workflows/runs/planner.dedupOnCreate/start', () =>
        HttpResponse.json({ message: 'OPENAI_API_KEY required' }, { status: 500 }),
      ),
    );
    const { Wrapper } = setup();
    const { result } = renderHook(() => useCreateTask('p1'), { wrapper: Wrapper });

    result.current.mutate({ plan_id: 'p1', title: 'Test' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.task.id).toBe('task-new');
    expect(result.current.data?.runId).toBeUndefined();
  });
});
