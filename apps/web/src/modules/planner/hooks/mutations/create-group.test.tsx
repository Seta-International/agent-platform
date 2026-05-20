import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { PropsWithChildren } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { plannerKeys } from '../../state/query-keys';
import { useCreateGroup } from './create-group';

const server = setupServer(
  http.post('*/api/planner/v1/groups', async ({ request }) => {
    const body = (await request.json()) as { name: string };
    return HttpResponse.json(
      {
        id: 'gnew',
        tenant_id: 't',
        name: body.name,
        account_id: null,
        created_by: 'u',
        created_at: '2026-05-20T00:00:00Z',
        updated_at: '2026-05-20T00:00:00Z',
        deleted_at: null,
        version: 1,
      },
      { status: 201 },
    );
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useCreateGroup', () => {
  it('optimistically inserts then reconciles with server row', async () => {
    const qc = new QueryClient();
    qc.setQueryData(plannerKeys.myGroups(), []);
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCreateGroup(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ name: 'New' });
    });
    await waitFor(() => {
      const groups = qc.getQueryData<{ id: string }[]>(plannerKeys.myGroups()) ?? [];
      expect(groups).toHaveLength(1);
      expect(groups[0]?.id).toBe('gnew');
    });
  });
});
