import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetGraphCacheForTest, graphGetDomains, graphListUsers } from '../../src/sso/graph.ts';

describe('Microsoft Graph proxy', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    process.env.MICROSOFT_CLIENT_ID = 'app-id-for-tests';
    process.env.MICROSOFT_CLIENT_SECRET = 'app-secret-for-tests';
    _resetGraphCacheForTest();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MICROSOFT_CLIENT_ID;
    delete process.env.MICROSOFT_CLIENT_SECRET;
  });

  function mockTokenResponse() {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tkn-abc', expires_in: 3600, token_type: 'Bearer' }),
    } as Response);
  }

  it('graphGetDomains returns the value array', async () => {
    mockTokenResponse();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [
          { id: 'acme.com', isVerified: true },
          { id: 'unverified.example', isVerified: false },
        ],
      }),
    } as Response);
    const out = await graphGetDomains('11111111-2222-3333-4444-555555555555');
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ id: 'acme.com', isVerified: true });
  });

  it('graphListUsers returns enabled and disabled accounts; filter happens at caller', async () => {
    mockTokenResponse();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [
          {
            id: 'oid-1',
            mail: 'a@acme.com',
            userPrincipalName: 'a@acme.com',
            displayName: 'Alice',
            accountEnabled: true,
          },
          {
            id: 'oid-2',
            mail: null,
            userPrincipalName: 'b@acme.com',
            displayName: 'Bob',
            accountEnabled: false,
          },
        ],
      }),
    } as Response);
    const out = await graphListUsers('11111111-2222-3333-4444-555555555555');
    expect(out).toHaveLength(2);
    expect(out[1]!.accountEnabled).toBe(false);
  });

  it('caches the application token across calls within the same Entra tenant', async () => {
    mockTokenResponse();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ value: [] }) } as Response);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ value: [] }) } as Response);
    await graphGetDomains('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    await graphListUsers('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws GRAPH_TOKEN_FAILED on non-2xx token response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'invalid',
    } as Response);
    await expect(graphGetDomains('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).rejects.toThrow(
      /GRAPH_TOKEN_FAILED/,
    );
  });

  it('throws GRAPH_CALL_FAILED on 5xx from /domains', async () => {
    mockTokenResponse();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    } as Response);
    await expect(graphGetDomains('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).rejects.toThrow(
      /GRAPH_CALL_FAILED/,
    );
  });
});
