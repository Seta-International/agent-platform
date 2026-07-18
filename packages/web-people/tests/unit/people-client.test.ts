import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addWorkerSkill,
  editWorker,
  fetchWorker,
  fetchWorkers,
  projectSearch,
  removeWorkerSkill,
  searchAccounts,
  searchPeople,
  searchProjects,
  searchSkills,
  type WorkerDetail,
  type WorkerPatch,
} from '../../src/api/people-client.ts';

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

  it('source.search maps {id,name} rows to {id,label}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ rows: [{ id: 's1', name: 'TypeScript' }] }),
      })),
    );

    const out = await searchSkills.source.search('type');
    expect(out).toEqual([{ id: 's1', label: 'TypeScript' }]);
  });

  it('seed sends ids param', async () => {
    const f = vi.fn(async () => ({
      ok: true,
      json: async () => ({ rows: [{ id: 's1', name: 'TypeScript' }] }),
    }));
    vi.stubGlobal('fetch', f);

    const out = await searchSkills.seed(['s1']);
    expect(out).toEqual([{ id: 's1', label: 'TypeScript' }]);
    expect(f.mock.calls[0]?.[0] as string).toContain('ids=s1');
  });
});

describe('searchAccounts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('source.search maps {id,name} rows to {id,label}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ rows: [{ id: 'a1', name: 'Acme Corp' }] }),
      })),
    );

    const out = await searchAccounts.source.search('acme');
    expect(out).toEqual([{ id: 'a1', label: 'Acme Corp' }]);
  });
});

describe('searchPeople', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('source.search maps worker rows to {id: worker_id, label: full_name}', async () => {
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
              work_email: null,
            },
          ],
          total: 1,
        }),
      })),
    );

    const out = await searchPeople.source.search('alice');
    expect(out).toEqual([{ id: 'w1', label: 'Alice' }]);
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
    expect(out).toEqual([{ id: 'p1', label: 'Project Alpha' }]);
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

describe('projectSearch', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('source(accountIds).search passes account_id filter', async () => {
    const f = vi.fn(async () => ({
      ok: true,
      json: async () => ({ rows: [{ id: 'p1', name: 'Alpha' }] }),
    }));
    vi.stubGlobal('fetch', f);

    const out = await projectSearch.source(['acc-1']).search('alpha');
    expect(out).toEqual([{ id: 'p1', label: 'Alpha' }]);
    const url = f.mock.calls[0]?.[0] as string;
    expect(url).toContain('account_id=acc-1');
    expect(url).toContain('search=alpha');
  });

  it('source() without accountIds omits the account_id filter', async () => {
    const f = vi.fn(async () => ({
      ok: true,
      json: async () => ({ rows: [] }),
    }));
    vi.stubGlobal('fetch', f);

    await projectSearch.source().search('beta');
    const url = f.mock.calls[0]?.[0] as string;
    expect(url).not.toContain('account_id');
  });

  it('seed hits ?ids=<csv> with no account_id filter', async () => {
    const f = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        rows: [
          { id: 'p1', name: 'Alpha' },
          { id: 'p2', name: 'Beta' },
        ],
      }),
    }));
    vi.stubGlobal('fetch', f);

    const out = await projectSearch.seed(['p1', 'p2']);
    expect(out).toEqual([
      { id: 'p1', label: 'Alpha' },
      { id: 'p2', label: 'Beta' },
    ]);
    const url = f.mock.calls[0]?.[0] as string;
    expect(url).toContain('/api/people/v1/projects');
    expect(url).toContain('ids=p1%2Cp2');
    expect(url).not.toContain('account_id');
  });

  it('seed returns [] for empty ids without fetching', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);

    const out = await projectSearch.seed([]);
    expect(out).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('WorkerPatch type', () => {
  it('includes job_title and org_unit_id as optional nullable fields', () => {
    const p1: WorkerPatch = { job_title: 'Engineer' };
    const p2: WorkerPatch = { job_title: null };
    const p3: WorkerPatch = { org_unit_id: 'ou-1' };
    const p4: WorkerPatch = { org_unit_id: null };
    const p5: WorkerPatch = { job_title: 'Lead', org_unit_id: 'ou-2' };
    expect(p1.job_title).toBe('Engineer');
    expect(p2.job_title).toBeNull();
    expect(p3.org_unit_id).toBe('ou-1');
    expect(p4.org_unit_id).toBeNull();
    expect(p5).toEqual({ job_title: 'Lead', org_unit_id: 'ou-2' });
  });
});

describe('editWorker', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('PATCHes job_title and org_unit_id correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: 3 }),
    });

    const result = await editWorker('worker-1', {
      expected_version: 2,
      patch: { job_title: 'Lead Engineer', org_unit_id: 'ou-99' },
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/people/v1/workers/worker-1');
    expect(init.method).toBe('PATCH');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body as string)).toEqual({
      expected_version: 2,
      patch: { job_title: 'Lead Engineer', org_unit_id: 'ou-99' },
    });
    expect(result.version).toBe(3);
  });

  it('sends null job_title to clear the field', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: 4 }),
    });

    await editWorker('worker-1', {
      expected_version: 3,
      patch: { job_title: null },
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      expected_version: 3,
      patch: { job_title: null },
    });
  });
});

describe('fetchWorker (WorkerDetail)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns enriched WorkerDetail including org_unit, accounts, skills', async () => {
    const detail: WorkerDetail = {
      worker_id: 'w1',
      full_name: 'Alice',
      job_title: 'Engineer',
      work_email: 'alice@example.com',
      phone: null,
      gender: null,
      lifecycle_stage: 'active',
      onboarding_date: null,
      offboarding_date: null,
      manager_name: 'Boss',
      org_unit_id: 'ou-1',
      org_unit_name: 'Delivery',
      accounts: [{ id: 'acc-1', name: 'Acme' }],
      skills: [{ id: 'sk-1', name: 'TypeScript' }],
      dob: null,
      emergency_contact: null,
      version: 2,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => detail })),
    );

    const result = await fetchWorker('w1');
    expect(result.org_unit_id).toBe('ou-1');
    expect(result.org_unit_name).toBe('Delivery');
    expect(result.manager_name).toBe('Boss');
    expect(result.accounts).toEqual([{ id: 'acc-1', name: 'Acme' }]);
    expect(result.skills).toEqual([{ id: 'sk-1', name: 'TypeScript' }]);
    expect(result.job_title).toBe('Engineer');
    expect(result.version).toBe(2);
  });
});

describe('addWorkerSkill', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs skill_id to the correct URL with credentials', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await addWorkerSkill('worker-1', 'skill-abc');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/people/v1/workers/worker-1/skills');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ skill_id: 'skill-abc' });
  });

  it('includes level when provided', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await addWorkerSkill('worker-1', 'skill-abc', 3);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ skill_id: 'skill-abc', level: 3 });
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Forbidden' }),
    });

    // `.rejects.toThrow(<arg>)` mis-reads the message as '' under happy-dom (vitest 4.1.x).
    await expect(addWorkerSkill('worker-1', 'skill-abc')).rejects.toMatchObject({
      message: expect.stringContaining('Forbidden'),
    });
  });
});

describe('removeWorkerSkill', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('DELETEs to the correct URL with credentials', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await removeWorkerSkill('worker-1', 'skill-xyz');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/people/v1/workers/worker-1/skills/skill-xyz');
    expect(init.method).toBe('DELETE');
    expect(init.credentials).toBe('include');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ message: 'Not found' }),
    });

    // `.rejects.toThrow(<arg>)` mis-reads the message as '' under happy-dom (vitest 4.1.x).
    await expect(removeWorkerSkill('worker-1', 'skill-xyz')).rejects.toMatchObject({
      message: expect.stringContaining('Not found'),
    });
  });
});
