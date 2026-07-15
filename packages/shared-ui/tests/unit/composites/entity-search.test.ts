import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpEntitySource } from '../../../src/composites/entity-search';

type Row = { worker_id: string; full_name: string };

function mockFetch(rows: Row[]) {
  return vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      ({ ok: true, json: async () => ({ rows }) }) as unknown as Response,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('createHttpEntitySource', () => {
  const make = () =>
    createHttpEntitySource<Row>({
      path: '/api/people/v1/workers',
      extract: (j) => (j as { rows: Row[] }).rows,
      mapRow: (w) => ({ id: w.worker_id, label: w.full_name }),
    });

  it('builds a search request and maps rows', async () => {
    const f = mockFetch([{ worker_id: 'w1', full_name: 'Alice' }]);
    vi.stubGlobal('fetch', f);
    const out = await make().source.search('ali');
    expect(out).toEqual([{ id: 'w1', label: 'Alice' }]);
    const url = (f.mock.calls[0] as unknown as [string, RequestInit])[0];
    expect(url).toContain('/api/people/v1/workers?');
    expect(url).toContain('search=ali');
    expect(url).toContain('pageSize=20');
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].credentials).toBe('include');
  });

  it('bootstrap requests without a search term', async () => {
    const f = mockFetch([{ worker_id: 'w1', full_name: 'Alice' }]);
    vi.stubGlobal('fetch', f);
    const out = await make().source.bootstrap();
    expect(out).toEqual([{ id: 'w1', label: 'Alice' }]);
    const url = (f.mock.calls[0] as unknown as [string])[0];
    expect(url).not.toContain('search=');
  });

  it('seed short-circuits on empty and otherwise passes ids', async () => {
    const f = mockFetch([{ worker_id: 'w2', full_name: 'Bob' }]);
    vi.stubGlobal('fetch', f);
    const api = make();
    expect(await api.seed([])).toEqual([]);
    expect(f).not.toHaveBeenCalled();
    const out = await api.seed(['w2', 'w3']);
    expect(out).toEqual([{ id: 'w2', label: 'Bob' }]);
    expect((f.mock.calls[0] as unknown as [string])[0]).toContain('ids=w2%2Cw3');
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response),
    );
    await expect(make().source.search('x')).rejects.toThrow();
  });

  it('cancel aborts the in-flight search request', async () => {
    const f = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    vi.stubGlobal('fetch', f);
    const api = make();
    const pending = api.source.search('a');
    api.source.cancel?.();
    await expect(pending).rejects.toThrow();
  });
});
