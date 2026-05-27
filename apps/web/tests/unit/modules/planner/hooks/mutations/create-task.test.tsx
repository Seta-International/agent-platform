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
  it('calls the dedupOnCreate workflow start endpoint with task draft', async () => {
    const captured = vi.fn();
    server.use(
      http.post('/api/agent/v1/workflows/runs/dedupOnCreate/start', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        captured(body);
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
    expect(captured).toHaveBeenCalledTimes(1);
    expect(captured.mock.calls[0]![0]).toMatchObject({
      title: 'Build it',
      plan_id: 'p1',
      bucket_id: 'b1',
      description: 'some desc',
    });
  });

  it('returns error when workflow start fails', async () => {
    server.use(
      http.post('/api/agent/v1/workflows/runs/dedupOnCreate/start', () => {
        return HttpResponse.json({ message: 'OPENAI_API_KEY required' }, { status: 500 });
      }),
    );
    const { Wrapper } = setup();
    const { result } = renderHook(() => useCreateTask('p1'), { wrapper: Wrapper });

    result.current.mutate({ plan_id: 'p1', title: 'Test' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('OPENAI_API_KEY required');
  });
});
