import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionScopeProjection } from '../../../src/api/client.ts';
import { sessionQueryKey } from '../../../src/api/session-query.ts';
import {
  SessionProvider,
  useRefreshSession,
  useSession,
} from '../../../src/components/SessionProvider.tsx';

function makeSession(display_name: string): SessionScopeProjection {
  return {
    user_id: 'u-1',
    tenant_id: 't-1',
    tenant_name: 'Acme',
    tenant_slug: 'acme',
    email: 'ada@example.com',
    display_name,
    role_summary: { roles: [], cross_tenant_read: false },
    permissions: [],
    product_access: [],
    cross_tenant_read: false,
    tenant_local_password_disabled: false,
  };
}

function mockMe(responses: Array<{ status: number; body?: unknown }>) {
  let call = 0;
  return vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
    if (!String(url).includes('/api/identity/v1/me')) {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    const res = responses[Math.min(call, responses.length - 1)]!;
    call++;
    return Promise.resolve({
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      json: () => Promise.resolve(res.body),
    } as Response);
  });
}

function Consumer() {
  const session = useSession();
  const refresh = useRefreshSession();
  return (
    <div>
      <span data-testid="name">{session.display_name}</span>
      <button type="button" onClick={() => void refresh()}>
        refresh
      </button>
    </div>
  );
}

function renderWithProviders(initial: SessionScopeProjection, qc: QueryClient) {
  return render(
    <QueryClientProvider client={qc}>
      <SessionProvider session={initial}>
        <Consumer />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('SessionProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('serves the initial session without any network fetch', () => {
    const fetchSpy = mockMe([{ status: 200, body: makeSession('Never Fetched') }]);
    renderWithProviders(makeSession('Ada Lovelace'), makeQueryClient());

    expect(screen.getByTestId('name')).toHaveTextContent('Ada Lovelace');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reads the session from the shared query cache when one is already there', () => {
    const fetchSpy = mockMe([{ status: 200, body: makeSession('Never Fetched') }]);
    const qc = makeQueryClient();
    // The route guard (ensureSession) populated the cache before render.
    qc.setQueryData(sessionQueryKey, makeSession('From Cache'));

    renderWithProviders(makeSession('Stale Prop'), qc);

    expect(screen.getByTestId('name')).toHaveTextContent('From Cache');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refreshSession fetches once, updates consumers, and writes the shared cache', async () => {
    const fetchSpy = mockMe([{ status: 200, body: makeSession('Ada Updated') }]);
    const qc = makeQueryClient();
    renderWithProviders(makeSession('Ada Lovelace'), qc);

    await userEvent.click(screen.getByRole('button', { name: 'refresh' }));

    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Ada Updated'));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData<SessionScopeProjection>(sessionQueryKey)?.display_name).toBe(
      'Ada Updated',
    );
  });

  it('keeps the last known session when a refresh comes back unauthenticated', async () => {
    const fetchSpy = mockMe([{ status: 401 }]);
    renderWithProviders(makeSession('Ada Lovelace'), makeQueryClient());

    await userEvent.click(screen.getByRole('button', { name: 'refresh' }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('name')).toHaveTextContent('Ada Lovelace');
  });
});
