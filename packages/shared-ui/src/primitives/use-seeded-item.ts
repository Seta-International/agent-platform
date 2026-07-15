import { useEffect, useState } from 'react';
import type { SearchableItem } from './typeahead';

/**
 * Resolve a single persisted id to its item on mount (and whenever the id changes).
 *
 * Endpoints backing a `seed` fn may ignore the `ids` query param and return the
 * full unfiltered list — never assume `items[0]` is the requested id. This hook
 * always matches the resolved items against `id` explicitly.
 */
export function useSeededItem(
  id: string | null | undefined,
  seed: (ids: string[]) => Promise<SearchableItem[]>,
): [SearchableItem | null, (item: SearchableItem | null) => void] {
  const [item, setItem] = useState<SearchableItem | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: seed is expected stable; id drives re-resolution
  useEffect(() => {
    if (!id) {
      setItem(null);
      return;
    }
    let cancelled = false;
    seed([id])
      .then((items) => {
        if (!cancelled) setItem(items.find((i) => i.id === id) ?? null);
      })
      .catch(() => {
        if (!cancelled) setItem(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return [item, setItem];
}

/**
 * Resolve many persisted ids to their items, each matched by id, in `ids` order.
 *
 * Same root-cause guard as {@link useSeededItem}: never trust the order or
 * completeness of what `seed` resolves — filter and reorder against `ids`.
 */
export function useSeededItems(
  ids: string[],
  seed: (ids: string[]) => Promise<SearchableItem[]>,
): [SearchableItem[], (items: SearchableItem[]) => void] {
  const [items, setItems] = useState<SearchableItem[]>([]);
  const key = ids.join(',');

  // biome-ignore lint/correctness/useExhaustiveDependencies: key (ids joined) is the real dependency; seed is expected stable
  useEffect(() => {
    if (ids.length === 0) {
      setItems([]);
      return;
    }
    let cancelled = false;
    seed(ids)
      .then((resolved) => {
        if (cancelled) return;
        const byId = new Map(resolved.map((i) => [i.id, i]));
        setItems(ids.map((id) => byId.get(id)).filter((i): i is SearchableItem => i != null));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return [items, setItems];
}
