import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchWorkers,
  searchAccounts,
  searchPeople,
  searchProjects,
  searchSkills,
  setPortalAccess,
  setPortalAccessBulk,
} from '../../src/api/people-client.ts';

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

describe('fetchWorkers', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds multi-filter querystring and parses {rows,total}', async () => {
    const rows = [
      {
        worker_id: 'w1',
        full_name: 'Alice',
        job_title: 'Engineer',
        work_email: 'alice@example.com',
        phone: null,
        gender: null,
        lifecycle_stage: 'active',
        onboarding_date: null,
        offboarding_date: null,
        manager_name: null,
        portal_access: true,
        accounts: [],
        skills: [],
      },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ rows, total: 42 }),
    });

    const result = await fetchWorkers({
      search: 'alice',
      status: ['active', 'on_leave'],
      account_id: ['acc-1', 'acc-2'],
      project_id: ['proj-1'],
      skill_id: ['skill-1', 'skill-2'],
      sort: { field: 'full_name', dir: 'asc' },
      page: 2,
      pageSize: 25,
    });

    expect(result).toEqual({ rows, total: 42 });

    const url = mockFetch.mock.calls[0]?.[0] as string;
    expect(url).toContain('search=alice');
    expect(url).toContain('status=active%2Con_leave');
    expect(url).toContain('account_id=acc-1%2Cacc-2');
    expect(url).toContain('project_id=proj-1');
    expect(url).toContain('skill_id=skill-1%2Cskill-2');
    expect(url).toContain('sort=full_name%3Aasc');
    expect(url).toContain('page=2');
    expect(url).toContain('pageSize=25');
  });

  it('GETs /api/people/v1/workers with no params when called with no query', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ rows: [], total: 0 }),
    });

    const result = await fetchWorkers();
    expect(result).toEqual({ rows: [], total: 0 });

    const url = mockFetch.mock.calls[0]?.[0] as string;
    expect(url).toBe('/api/people/v1/workers');
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('include');
  });
});

describe('searchSkills', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps {id,name} rows to {value,label}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ rows: [{ id: 's1', name: 'TypeScript' }] }),
      })),
    );

    const out = await searchSkills.search('type');
    expect(out).toEqual([{ value: 's1', label: 'TypeScript' }]);
  });

  it('resolveByIds sends ids param', async () => {
    const f = vi.fn(async () => ({
      ok: true,
      json: async () => ({ rows: [{ id: 's1', name: 'TypeScript' }] }),
    }));
    vi.stubGlobal('fetch', f);

    const out = await searchSkills.resolveByIds(['s1']);
    expect(out).toEqual([{ value: 's1', label: 'TypeScript' }]);
    expect(f.mock.calls[0]?.[0] as string).toContain('ids=s1');
  });
});

describe('searchAccounts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps {id,name} rows to {value,label}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ rows: [{ id: 'a1', name: 'Acme Corp' }] }),
      })),
    );

    const out = await searchAccounts.search('acme');
    expect(out).toEqual([{ value: 'a1', label: 'Acme Corp' }]);
  });
});

describe('searchPeople', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps worker rows to {value: worker_id, label: full_name}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          rows: [
            {
              worker_id: 'w1',
              full_name: 'Alice',
              lifecycle_stage: 'active',
              portal_access: true,
              work_email: null,
            },
          ],
          total: 1,
        }),
      })),
    );

    const out = await searchPeople.search('alice');
    expect(out).toEqual([{ value: 'w1', label: 'Alice' }]);
  });
});

describe('searchProjects', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends account_id when accountIds provided', async () => {
    const f = vi.fn(async () => ({
      ok: true,
      json: async () => ({ rows: [{ id: 'p1', name: 'Project Alpha' }] }),
    }));
    vi.stubGlobal('fetch', f);

    const out = await searchProjects('alpha', ['acc-1', 'acc-2']);
    expect(out).toEqual([{ value: 'p1', label: 'Project Alpha' }]);
    const url = f.mock.calls[0]?.[0] as string;
    expect(url).toContain('/api/people/v1/projects');
    expect(url).toContain('account_id=acc-1%2Cacc-2');
    expect(url).toContain('search=alpha');
  });

  it('omits account_id when accountIds not provided', async () => {
    const f = vi.fn(async () => ({
      ok: true,
      json: async () => ({ rows: [] }),
    }));
    vi.stubGlobal('fetch', f);

    await searchProjects('beta');
    const url = f.mock.calls[0]?.[0] as string;
    expect(url).not.toContain('account_id');
  });
});
