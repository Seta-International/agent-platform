import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { PropsWithChildren } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useAddGroupMembers } from '../../../../../../src/modules/planner/hooks/mutations/add-group-members';
import { plannerKeys } from '../../../../../../src/modules/planner/state/query-keys';

const GROUP_ID = 'g1';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return { qc, Wrapper };
}

describe('useAddGroupMembers', () => {
  it('sends members to the bulk endpoint', async () => {
    const captured = vi.fn();
    server.use(
      http.post(`/api/planner/v1/groups/${GROUP_ID}/members/bulk`, async ({ request }) => {
        captured(await request.json());
        return HttpResponse.json({ members: [] }, { status: 201 });
      }),
    );
    const { Wrapper } = setup();
    const { result } = renderHook(() => useAddGroupMembers(GROUP_ID), { wrapper: Wrapper });

    result.current.mutate([{ user_id: 'u1' }, { user_id: 'u2' }]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(captured).toHaveBeenCalledWith({ members: [{ user_id: 'u1' }, { user_id: 'u2' }] });
  });

  it('invalidates groupMembers query on 201', async () => {
    server.use(
      http.post(`/api/planner/v1/groups/${GROUP_ID}/members/bulk`, () =>
        HttpResponse.json({ members: [] }, { status: 201 }),
      ),
    );
    const { qc, Wrapper } = setup();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useAddGroupMembers(GROUP_ID), { wrapper: Wrapper });

    result.current.mutate([{ user_id: 'u1' }]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: plannerKeys.groupMembers(GROUP_ID) }),
    );
  });

  it('does NOT invalidate groupMembers on 202 (background job)', async () => {
    server.use(
      http.post(`/api/planner/v1/groups/${GROUP_ID}/members/bulk`, () =>
        HttpResponse.json({ job_id: 'j1' }, { status: 202 }),
      ),
    );
    const { qc, Wrapper } = setup();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useAddGroupMembers(GROUP_ID), { wrapper: Wrapper });

    result.current.mutate([{ user_id: 'u1' }]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('surfaces error on failure', async () => {
    server.use(
      http.post(`/api/planner/v1/groups/${GROUP_ID}/members/bulk`, () =>
        HttpResponse.json({ error: 'FORBIDDEN' }, { status: 403 }),
      ),
    );
    const { Wrapper } = setup();
    const { result } = renderHook(() => useAddGroupMembers(GROUP_ID), { wrapper: Wrapper });

    result.current.mutate([{ user_id: 'u1' }]);

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
