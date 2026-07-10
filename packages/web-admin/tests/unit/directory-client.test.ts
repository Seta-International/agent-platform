import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bulkRole,
  listDirectory,
  provisionAccount,
  reactivateAccount,
  suspendAccount,
} from '../../src/users/api/directory-client.ts';

afterEach(() => vi.restoreAllMocks());

describe('directory-client', () => {
  it('GETs /directory with search + status and returns rows', async () => {
    const row = {
      person_id: 'p1',
      full_name: 'Mai Nguyen',
      work_email: 'mai@example.com',
      job_title: 'Engineer',
      employment_status: 'active',
      account_status: 'none',
      user_id: null,
      roles: [],
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ rows: [row], page: 0, hasMore: false }), { status: 200 }),
      );
    const res = await listDirectory({ search: 'mai', status: 'none' });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/people/v1/directory?'),
      expect.objectContaining({ credentials: 'include' }),
    );
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('search=mai');
    expect(url).toContain('status=none');
    expect(res.rows[0].account_status).toBe('none');
    expect(res.hasMore).toBe(false);
  });

  it('passes page param when provided', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ rows: [], page: 2, hasMore: false }), { status: 200 }),
      );
    await listDirectory({ page: 2 });
    expect(fetchMock.mock.calls[0][0]).toContain('page=2');
  });

  it('throws on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 403 }));
    await expect(listDirectory()).rejects.toThrow('403');
  });

  it('POSTs to provision endpoint', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ user_id: 'u1' }), { status: 200 }));
    await provisionAccount('person-abc');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/people/v1/directory/person-abc/provision',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('POSTs to suspend endpoint', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await suspendAccount('user-xyz');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/identity/v1/users/user-xyz/suspend',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('POSTs to reactivate endpoint', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await reactivateAccount('user-xyz');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/identity/v1/users/user-xyz/reactivate',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('POSTs bulk-role-grants with correct body', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ granted: 2, skipped: 0 }), { status: 200 }));
    await bulkRole({ user_ids: ['u1', 'u2'], role_slug: 'org.admin', action: 'grant' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/identity/v1/users/bulk-role-grants',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.user_ids).toEqual(['u1', 'u2']);
    expect(body.role_slug).toBe('org.admin');
    expect(body.action).toBe('grant');
    expect(body.scope_type).toBe('tenant');
  });
});
