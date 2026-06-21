import type { EntityOption } from './async-combobox';

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`entity search failed: ${res.status}`);
  return res.json();
}

export function createHttpEntitySearch<Row>(opts: {
  path: string;
  extract: (json: unknown) => Row[];
  mapRow: (row: Row) => EntityOption;
  limit?: number;
}): {
  search: (query: string) => Promise<EntityOption[]>;
  resolveByIds: (ids: string[]) => Promise<EntityOption[]>;
} {
  const limit = opts.limit ?? 20;
  const run = async (qs: URLSearchParams): Promise<EntityOption[]> => {
    const json = await getJson(`${opts.path}?${qs.toString()}`);
    return opts.extract(json).map(opts.mapRow);
  };
  return {
    search: (query) => {
      const qs = new URLSearchParams({ pageSize: String(limit) });
      if (query) qs.set('search', query);
      return run(qs);
    },
    resolveByIds: (ids) => {
      if (ids.length === 0) return Promise.resolve([]);
      return run(new URLSearchParams({ ids: ids.join(',') }));
    },
  };
}
