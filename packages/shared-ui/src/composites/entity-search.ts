import type { SearchableItem, SearchSource } from '../primitives/typeahead';

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { credentials: 'include', signal });
  if (!res.ok) throw new Error(`entity search failed: ${res.status}`);
  return res.json();
}

/**
 * Build an Astryx SearchSource for a paged HTTP entity endpoint, plus a `seed`
 * helper that resolves persisted ids into items (for initialising a Typeahead/
 * Tokenizer `value` when only the id is known).
 */
export function createHttpEntitySource<Row>(opts: {
  path: string;
  extract: (json: unknown) => Row[];
  mapRow: (row: Row) => SearchableItem;
  limit?: number;
  extraParams?: Record<string, string>;
}): { source: SearchSource<SearchableItem>; seed: (ids: string[]) => Promise<SearchableItem[]> } {
  const limit = opts.limit ?? 20;
  let controller: AbortController | null = null;
  const run = async (qs: URLSearchParams, signal?: AbortSignal): Promise<SearchableItem[]> => {
    const url = qs.toString() ? `${opts.path}?${qs.toString()}` : opts.path;
    return opts.extract(await getJson(url, signal)).map(opts.mapRow);
  };
  const query = (q: string): URLSearchParams => {
    const qs = new URLSearchParams({ pageSize: String(limit) });
    if (q) qs.set('search', q);
    if (opts.extraParams) for (const [k, v] of Object.entries(opts.extraParams)) qs.set(k, v);
    return qs;
  };
  return {
    source: {
      search(q: string) {
        controller?.abort();
        controller = new AbortController();
        return run(query(q), controller.signal);
      },
      bootstrap() {
        return run(query(''));
      },
      cancel() {
        controller?.abort();
      },
    },
    seed: (ids) =>
      ids.length === 0 ? Promise.resolve([]) : run(new URLSearchParams({ ids: ids.join(',') })),
  };
}
