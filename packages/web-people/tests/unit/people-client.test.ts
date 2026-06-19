import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPortalAccess, setPortalAccessBulk } from '../../src/api/people-client.ts';

describe('setPortalAccess', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs { enabled: true } to the correct URL with credentials and JSON content-type', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ portal_access: true, changed: true }),
    });

    const result = await setPortalAccess('worker-123', true);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/people/v1/workers/worker-123/portal-access');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ enabled: true });
    expect(result).toEqual({ portal_access: true, changed: true });
  });

  it('POSTs { enabled: false } correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ portal_access: false, changed: false }),
    });

    await setPortalAccess('worker-456', false);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ enabled: false });
  });
});

describe('setPortalAccessBulk', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs { worker_ids, enabled } to the bulk endpoint with credentials and JSON content-type', async () => {
    const ids = ['worker-1', 'worker-2'];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { worker_id: 'worker-1', status: 'changed' },
          { worker_id: 'worker-2', status: 'changed' },
        ],
      }),
    });

    const result = await setPortalAccessBulk(ids, true);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/people/v1/workers/portal-access/bulk');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ worker_ids: ids, enabled: true });
    expect(result.results).toHaveLength(2);
  });
});
