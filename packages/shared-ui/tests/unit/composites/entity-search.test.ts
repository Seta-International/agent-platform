import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpEntitySearch } from '../../../src/composites/entity-search';

type Row = { worker_id: string; full_name: string };

function mockFetch(rows: Row[]) {
  return vi.fn(async () => ({ ok: true, json: async () => ({ rows }) }) as unknown as Response);
}

afterEach(() => vi.restoreAllMocks());

describe('createHttpEntitySearch', () => {
  const make = () =>
    createHttpEntitySearch<Row>({
      path: '/api/people/v1/workers',
      extract: (j) => (j as { rows: Row[] }).rows,
      mapRow: (w) => ({ value: w.worker_id, label: w.full_name }),
    });

  it('builds a search request and maps rows', async () => {
    const f = mockFetch([{ worker_id: 'w1', full_name: 'Alice' }]);
    vi.stubGlobal('fetch', f);
    const out = await make().search('ali');
    expect(out).toEqual([{ value: 'w1', label: 'Alice' }]);
    const url = f.mock.calls[0]?.[0] as string;
    expect(url).toContain('/api/people/v1/workers?');
    expect(url).toContain('search=ali');
    expect(url).toContain('pageSize=20');
    expect((f.mock.calls[0]?.[1] as RequestInit).credentials).toBe('include');
  });

  it('resolveByIds short-circuits on empty and otherwise passes ids', async () => {
    const f = mockFetch([{ worker_id: 'w2', full_name: 'Bob' }]);
    vi.stubGlobal('fetch', f);
    const api = make();
    expect(await api.resolveByIds([])).toEqual([]);
    expect(f).not.toHaveBeenCalled();
    const out = await api.resolveByIds(['w2', 'w3']);
    expect(out).toEqual([{ value: 'w2', label: 'Bob' }]);
    expect(f.mock.calls[0]?.[0] as string).toContain('ids=w2%2Cw3');
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response),
    );
    await expect(make().search('x')).rejects.toThrow();
  });
});
