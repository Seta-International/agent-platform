import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionScopeProjection } from '../../../src/api/client.ts';
import { ensureSession, sessionQueryKey } from '../../../src/api/session-query.ts';

const ME_RESPONSE: SessionScopeProjection = {
  user_id: 'u-1',
  tenant_id: 't-1',
  tenant_name: 'Acme',
  tenant_slug: 'acme',
  email: 'ada@example.com',
  display_name: 'Ada Lovelace',
  role_summary: { roles: ['pm.user'], cross_tenant_read: false },
  permissions: ['people.worker.read'],
  product_access: [],
  cross_tenant_read: false,
  tenant_local_password_disabled: false,
};

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

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('ensureSession', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fetches /identity/v1/me once and serves repeat calls from the cache', async () => {
    const fetchSpy = mockMe([{ status: 200, body: ME_RESPONSE }]);
    const qc = makeQueryClient();

    const first = await ensureSession(qc);
    const second = await ensureSession(qc);
    const third = await ensureSession(qc);

    expect(first?.user_id).toBe('u-1');
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('never caches an unauthenticated result', async () => {
    const fetchSpy = mockMe([{ status: 401 }]);
    const qc = makeQueryClient();

    const result = await ensureSession(qc);

    expect(result).toBeNull();
    // A cached null would bounce the post-login SPA navigation back to /login.
    expect(qc.getQueryData(sessionQueryKey)).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('resolves a new session after login instead of a stale signed-out state', async () => {
    const fetchSpy = mockMe([{ status: 401 }, { status: 200, body: ME_RESPONSE }]);
    const qc = makeQueryClient();

    const before = await ensureSession(qc);
    const after = await ensureSession(qc);

    expect(before).toBeNull();
    expect(after?.user_id).toBe('u-1');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
