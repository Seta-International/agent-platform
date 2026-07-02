import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchProfile, patchProfile, searchSkillsApi } from '../../../src/api/client.ts';

const ME_RESPONSE = {
  user_id: 'u-1',
  tenant_id: 't-1',
  tenant_name: 'Acme',
  tenant_slug: 'acme',
  email: 'ada@example.com',
  display_name: 'Ada Lovelace',
  role_summary: { roles: ['pm.user'], cross_tenant_read: false },
  permissions: ['people.worker.read'],
  cross_tenant_read: false,
  tenant_local_password_disabled: false,
};

const PEOPLE_PROFILE_RESPONSE = {
  availability_status: 'available',
  ooo_until: null,
  timezone: 'Asia/Ho_Chi_Minh',
  working_hours: { start: '09:00', end: '18:00' },
  skills: ['TypeScript', 'React'],
  bio: 'Lead engineer.',
  full_name: 'Ada Lovelace',
};

function mockFetch(handlers: Record<string, { status: number; body: unknown }>) {
  return vi.fn((url: string, _init?: RequestInit) => {
    const matched = Object.entries(handlers).find(([key]) => String(url).includes(key));
    if (!matched) throw new Error(`Unexpected fetch: ${url}`);
    const [, { status, body }] = matched;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      body: null,
    } as Response);
  });
}

describe('fetchProfile', () => {
  afterEach(() => vi.restoreAllMocks());

  it('calls identity /me and people /me/profile and composes the view-model', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      mockFetch({
        '/api/identity/v1/me': { status: 200, body: ME_RESPONSE },
        '/api/people/v1/me/profile': { status: 200, body: PEOPLE_PROFILE_RESPONSE },
      }),
    );

    const dto = await fetchProfile();

    const urls = fetchSpy.mock.calls.map((c) => c[0]);
    expect(urls).toContain('/api/identity/v1/me');
    expect(urls).toContain('/api/people/v1/me/profile');

    // account fields from identity
    expect(dto.user_id).toBe('u-1');
    expect(dto.display_name).toBe('Ada Lovelace');
    expect(dto.email).toBe('ada@example.com');

    // HR fields from People
    expect(dto.availability_status).toBe('available');
    expect(dto.timezone).toBe('Asia/Ho_Chi_Minh');
    expect(dto.skills).toEqual(['TypeScript', 'React']);
    expect(dto.bio).toBe('Lead engineer.');
    expect(dto.working_hours).toEqual({ start: '09:00', end: '18:00' });
  });
});

describe('patchProfile', () => {
  beforeEach(() => {
    // stub fetchProfile for the re-fetch after patch
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      mockFetch({
        '/api/identity/v1/me': { status: 200, body: ME_RESPONSE },
        '/api/people/v1/me/profile': { status: 200, body: PEOPLE_PROFILE_RESPONSE },
        '/api/identity/v1/profile': { status: 200, body: {} },
        '/api/people/v1/me/presence': { status: 204, body: null },
        '/api/people/v1/me/bio': { status: 204, body: null },
        '/api/people/v1/me/skills': { status: 204, body: null },
      }),
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('routes display_name to PATCH /api/identity/v1/profile', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await patchProfile({ display_name: 'New Name' });

    const identityCall = fetchSpy.mock.calls.find(
      ([url, init]) =>
        String(url).includes('/api/identity/v1/profile') &&
        (init as RequestInit)?.method === 'PATCH',
    );
    expect(identityCall).toBeDefined();
    expect(JSON.parse((identityCall![1] as RequestInit).body as string)).toEqual({
      display_name: 'New Name',
    });
  });

  it('routes availability_status to PATCH /api/people/v1/me/presence', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await patchProfile({ availability_status: 'busy', ooo_until: null });

    const presenceCall = fetchSpy.mock.calls.find(
      ([url, init]) =>
        String(url).includes('/api/people/v1/me/presence') &&
        (init as RequestInit)?.method === 'PATCH',
    );
    expect(presenceCall).toBeDefined();
    const body = JSON.parse((presenceCall![1] as RequestInit).body as string);
    expect(body.availability_status).toBe('busy');
  });

  it('routes timezone to PATCH /api/people/v1/me/presence', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await patchProfile({ timezone: 'UTC' });

    const presenceCall = fetchSpy.mock.calls.find(
      ([url, init]) =>
        String(url).includes('/api/people/v1/me/presence') &&
        (init as RequestInit)?.method === 'PATCH',
    );
    expect(presenceCall).toBeDefined();
    expect(JSON.parse((presenceCall![1] as RequestInit).body as string)).toEqual({
      timezone: 'UTC',
    });
  });

  it('routes bio to PATCH /api/people/v1/me/bio', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await patchProfile({ bio: 'My new bio' });

    const bioCall = fetchSpy.mock.calls.find(
      ([url, init]) =>
        String(url).includes('/api/people/v1/me/bio') && (init as RequestInit)?.method === 'PATCH',
    );
    expect(bioCall).toBeDefined();
    expect(JSON.parse((bioCall![1] as RequestInit).body as string)).toEqual({
      bio: 'My new bio',
    });
  });

  it('routes skills to PUT /api/people/v1/me/skills', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await patchProfile({ skills: ['TypeScript', 'React'] });

    const skillsCall = fetchSpy.mock.calls.find(
      ([url, init]) =>
        String(url).includes('/api/people/v1/me/skills') && (init as RequestInit)?.method === 'PUT',
    );
    expect(skillsCall).toBeDefined();
    expect(JSON.parse((skillsCall![1] as RequestInit).body as string)).toEqual({
      skills: ['TypeScript', 'React'],
    });
  });

  it('does NOT call identity profile patch when only bio changes', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await patchProfile({ bio: 'Just bio' });

    const identityPatch = fetchSpy.mock.calls.find(
      ([url, init]) =>
        String(url).includes('/api/identity/v1/profile') &&
        (init as RequestInit)?.method === 'PATCH',
    );
    expect(identityPatch).toBeUndefined();
  });
});

describe('searchSkillsApi', () => {
  afterEach(() => vi.restoreAllMocks());

  it('calls GET /api/people/v1/skills with search param and returns names', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          rows: [
            { id: 's-1', name: 'TypeScript' },
            { id: 's-2', name: 'React' },
          ],
        }),
    } as Response);

    const names = await searchSkillsApi('type');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const url = String(fetchSpy.mock.calls[0]![0]);
    expect(url).toContain('/api/people/v1/skills');
    expect(url).toContain('search=type');
    expect(names).toEqual(['TypeScript', 'React']);
  });

  it('does NOT call identity skill-search endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ rows: [] }),
    } as Response);

    await searchSkillsApi('rust');

    const url = String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(url).not.toContain('identity');
  });
});
