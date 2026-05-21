import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { PropsWithChildren } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { plannerKeys } from '../../state/query-keys';
import { useSetMemberRole } from './set-member-role';

const GROUP_ID = 'g1';
const USER_ID = 'u1';

function baseMember(over: Record<string, unknown> = {}) {
  return {
    group_id: GROUP_ID,
    user_id: USER_ID,
    role: 'member' as const,
    display_name: 'Alice',
    email: 'alice@example.com',
    added_at: '2026-05-20T00:00:00Z',
    added_by: 'admin',
    ...over,
  };
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  qc.setQueryData(plannerKeys.groupMembers(GROUP_ID), [baseMember()]);
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return { qc, Wrapper };
}

describe('useSetMemberRole', () => {
  it('optimistically updates the member role in the cache', async () => {
    server.use(
      http.patch(
        `/api/planner/v1/groups/${GROUP_ID}/members/${USER_ID}/role`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );

    const { qc, Wrapper } = setup();
    const { result } = renderHook(() => useSetMemberRole(GROUP_ID), { wrapper: Wrapper });

    result.current.mutate({ user_id: USER_ID, role: 'owner' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const members = qc.getQueryData<Array<{ user_id: string; role: string }>>(
      plannerKeys.groupMembers(GROUP_ID),
    )!;
    expect(members[0]!.user_id).toBe(USER_ID);
    expect(members[0]!.role).toBe('owner');
  });

  it('calls the correct URL with the role in the request body', async () => {
    const capturedUrl = vi.fn<(url: string) => void>();

    server.use(
      http.patch('*/members/*/role', ({ request }) => {
        capturedUrl(request.url);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { Wrapper } = setup();
    const { result } = renderHook(() => useSetMemberRole(GROUP_ID), { wrapper: Wrapper });

    result.current.mutate({ user_id: USER_ID, role: 'owner' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(capturedUrl).toHaveBeenCalledOnce();
    expect(capturedUrl.mock.calls[0]![0]).toContain(`/groups/${GROUP_ID}/members/${USER_ID}/role`);
  });

  it('rolls back the optimistic update on error', async () => {
    server.use(
      http.patch(`/api/planner/v1/groups/${GROUP_ID}/members/${USER_ID}/role`, () =>
        HttpResponse.json({ error: 'FORBIDDEN' }, { status: 403 }),
      ),
    );

    const { qc, Wrapper } = setup();
    const { result } = renderHook(() => useSetMemberRole(GROUP_ID), { wrapper: Wrapper });

    result.current.mutate({ user_id: USER_ID, role: 'owner' });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const members = qc.getQueryData<Array<{ user_id: string; role: string }>>(
      plannerKeys.groupMembers(GROUP_ID),
    )!;
    // Should be rolled back to original 'member' role
    expect(members[0]!.role).toBe('member');
  });
});
