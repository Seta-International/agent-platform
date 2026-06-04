import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { useNoDateTasks } from '../../../../../src/modules/planner/hooks/queries/use-no-date-tasks';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe('useNoDateTasks', () => {
  it('queries listTasks with plan_id and no_date=true', async () => {
    const seen: URL[] = [];
    server.use(
      http.get('/api/planner/v1/tasks', ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json({ tasks: [{ id: 'u1', title: 'Undated' }] });
      }),
    );

    const { result } = renderHook(() => useNoDateTasks('p1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(seen).toHaveLength(1);
    expect(seen[0]!.searchParams.get('plan_id')).toBe('p1');
    expect(seen[0]!.searchParams.get('no_date')).toBe('true');
    expect(result.current.data?.tasks).toHaveLength(1);
  });
});
