// apps/web/tests/unit/modules/planner/hooks/use-calendar-tasks.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { useCalendarTasks } from '../../../../../src/modules/planner/hooks/queries/use-calendar-tasks';

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

const task = (id: string) => ({ id, title: id }); // shape subset is enough for the hook

describe('useCalendarTasks', () => {
  it('fetches page 1 with full ISO instants and limit 50', async () => {
    const seen: URL[] = [];
    server.use(
      http.get('/api/planner/v1/plans/p1/tasks/calendar', ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json({ tasks: [task('a')], total_count: 1 });
      }),
    );

    const { result } = renderHook(() => useCalendarTasks('p1', '2026-06-01', '2026-06-30', 1), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total_count).toBe(1);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.searchParams.get('from')).toBe('2026-06-01T00:00:00.000Z');
    expect(seen[0]!.searchParams.get('to')).toBe('2026-06-30T23:59:59.999Z');
    expect(seen[0]!.searchParams.get('limit')).toBe('50');
    expect(seen[0]!.searchParams.get('cursor')).toBeNull();
  });

  it('resolves page 2 by chaining through page 1 cursor (AC-7)', async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.get('/api/planner/v1/plans/p1/tasks/calendar', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        seen.push(cursor);
        if (cursor === null)
          return HttpResponse.json({ tasks: [task('a')], next_cursor: 'c1', total_count: 2 });
        return HttpResponse.json({ tasks: [task('b')], total_count: 2 });
      }),
    );

    const { result } = renderHook(() => useCalendarTasks('p1', '2026-06-01', '2026-06-30', 2), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(seen).toEqual([null, 'c1']); // page 1 fetched first, then page 2 with its cursor
    expect(result.current.data?.tasks.map((t) => t.id)).toEqual(['b']);
    expect(result.current.data?.total_count).toBe(2);
  });

  it('refetches when the range changes (AC-6)', async () => {
    const seenFrom: (string | null)[] = [];
    server.use(
      http.get('/api/planner/v1/plans/p1/tasks/calendar', ({ request }) => {
        seenFrom.push(new URL(request.url).searchParams.get('from'));
        return HttpResponse.json({ tasks: [], total_count: 0 });
      }),
    );

    const wrapper = makeWrapper();
    const { result, rerender } = renderHook(
      ({ from, to }: { from: string; to: string }) => useCalendarTasks('p1', from, to, 1),
      { wrapper, initialProps: { from: '2026-06-01', to: '2026-06-30' } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ from: '2026-07-01', to: '2026-07-31' });
    await waitFor(() => expect(seenFrom).toHaveLength(2));
    expect(seenFrom[1]).toBe('2026-07-01T00:00:00.000Z');
  });

  it('returns an empty page (not an error) when paged past the end', async () => {
    server.use(
      http.get('/api/planner/v1/plans/p1/tasks/calendar', () =>
        HttpResponse.json({ tasks: [task('a')], total_count: 1 }),
      ),
    );

    const { result } = renderHook(() => useCalendarTasks('p1', '2026-06-01', '2026-06-30', 3), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.tasks).toEqual([]);
    expect(result.current.data?.total_count).toBe(1);
  });
});
