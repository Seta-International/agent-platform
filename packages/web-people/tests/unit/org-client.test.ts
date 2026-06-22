import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchOrgDelivery, fetchOrgStructure } from '../../src/api/org-client.ts';

describe('org-client', () => {
  const mockFetch = vi.fn();
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fetchOrgStructure GETs the endpoint with credentials and parses { units }', async () => {
    const units = [
      {
        id: 'u1',
        parent_id: null,
        name: 'Executive',
        kind: 'executive',
        sort: 0,
        head: null,
        members: [],
      },
    ];
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ units }) });
    const result = await fetchOrgStructure();
    expect(result).toEqual({ units });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/people/v1/org/structure');
    expect(init.credentials).toBe('include');
  });

  it('fetchOrgDelivery GETs the endpoint and parses { accounts }', async () => {
    const accounts = [{ account_id: 'a1', name: 'Acme', am: null, projects: [] }];
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ accounts }) });
    const result = await fetchOrgDelivery();
    expect(result).toEqual({ accounts });
    expect((mockFetch.mock.calls[0] as [string])[0]).toBe('/api/people/v1/org/delivery');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Forbidden' }),
    });
    await expect(fetchOrgStructure()).rejects.toThrow('Forbidden');
  });
});
