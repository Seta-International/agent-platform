import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getDirectorySyncStatus,
  listDirectoryConflicts,
  resolveDirectoryConflict,
  startDirectorySync,
} from '../../../src/m365-directory/api/directory-sync-client.ts';

afterEach(() => vi.restoreAllMocks());

function ok(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('directory-sync-client', () => {
  it('GETs open conflicts by default and passes the served actions through', async () => {
    const conflict = {
      id: 'c1',
      kind: 'email_collision',
      actions: ['link', 'ignore'],
      subject_type: 'person',
      subject_id: null,
      entra_oid: 'oid-1',
      detail: { work_email: 'mai@acme.com', candidates: [] },
      status: 'open',
      resolution: null,
      resolved_by: null,
      resolved_at: null,
      first_seen_at: '2026-08-01T00:00:00.000Z',
      last_seen_at: '2026-08-02T00:00:00.000Z',
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(ok({ conflicts: [conflict] }));

    const rows = await listDirectoryConflicts();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/integrations/m365/directory/conflicts?status=open',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].actions).toEqual(['link', 'ignore']);
  });

  it('GETs a non-default status when asked', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ conflicts: [] }));
    await listDirectoryConflicts('resolved');
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/integrations/m365/directory/conflicts?status=resolved',
    );
  });

  it('tolerates a conflicts payload with no rows array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({}));
    await expect(listDirectoryConflicts()).resolves.toEqual([]);
  });

  it('POSTs a resolution with action and params', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ resolved: true }));

    const result = await resolveDirectoryConflict({
      conflictId: 'c1',
      action: 'link',
      params: { person_id: 'p1' },
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/integrations/m365/directory/conflicts/c1/resolve',
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      action: 'link',
      params: { person_id: 'p1' },
    });
    expect(result).toEqual({ resolved: true });
  });

  it('omits params entirely when the action takes none', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ resolved: true }));
    await resolveDirectoryConflict({ conflictId: 'c1', action: 'ignore' });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ action: 'ignore' });
  });

  it('surfaces a refusal (200 + resolved:false) as data, not an error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      ok({ resolved: false, reason: 'already_resolved' }),
    );
    await expect(resolveDirectoryConflict({ conflictId: 'c1', action: 'keep' })).resolves.toEqual({
      resolved: false,
      reason: 'already_resolved',
    });
  });

  it('POSTs a full sync run', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(ok({ enqueued: true, full: true }));

    await startDirectorySync();

    expect(fetchMock.mock.calls[0][0]).toBe('/api/integrations/m365/directory/sync');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ full: true });
  });

  it('GETs the run status', async () => {
    const status = {
      configured: true,
      last_synced_at: '2026-08-02T03:00:00.000Z',
      last_status: 'ok',
      last_error: null,
      cursor_present: true,
      last_run: {
        occurred_at: '2026-08-02T03:00:00.000Z',
        full: false,
        counters: { users_seen: 12 },
      },
      open_conflicts: 0,
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok(status));

    await expect(getDirectorySyncStatus()).resolves.toMatchObject({ open_conflicts: 0 });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/integrations/m365/directory/status');
  });

  it('throws the server message on a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'forbidden' }), { status: 403 }),
    );
    await expect(listDirectoryConflicts()).rejects.toThrow('forbidden');
  });
});
