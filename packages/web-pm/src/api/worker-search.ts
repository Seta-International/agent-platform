import { createHttpEntitySource, type SearchableItem, type SearchSource } from '@seta/shared-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

export type WorkerRow = { worker_id: string; full_name: string };

/**
 * FUT-953 (AC1): pass `excludeAlumni: true` for any picker used to CREATE a new
 * allocation — alumni employees must not be selectable there. Pickers for other
 * purposes (account manager, project access, PM lead) must stay unfiltered: those
 * still need to reach a worker who has since become alumni (AC2's spirit).
 *
 * `excludeIds` drops specific worker ids from search/bootstrap results only —
 * `seed` still resolves them, since a role slot must always be able to display
 * whoever already holds it.
 */
export function useWorkerSource(opts?: { excludeAlumni?: boolean; excludeIds?: string[] }): {
  source: SearchSource<SearchableItem>;
  seed: (ids: string[]) => Promise<SearchableItem[]>;
} {
  const qc = useQueryClient();
  const excludeAlumni = opts?.excludeAlumni ?? false;
  const excludeIds = opts?.excludeIds ?? [];
  const excludeKey = excludeIds.join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: excludeKey is excludeIds' stable, content-based form (excludeIds itself is an array, unstable by reference) — the memo intentionally depends on excludeKey in its place.
  return useMemo(() => {
    const workerEntity = createHttpEntitySource<WorkerRow>({
      path: '/api/people/v1/workers',
      extract: (j) => (j as { rows: WorkerRow[] }).rows,
      mapRow: (w) => ({ id: w.worker_id, label: w.full_name }),
      extraParams: excludeAlumni ? { exclude_status: 'alumni' } : undefined,
    });
    const excluded = new Set(excludeIds);
    const dropExcluded = (items: SearchableItem[]) =>
      excluded.size === 0 ? items : items.filter((i) => !excluded.has(i.id));
    return {
      source: {
        search: (q: string) =>
          qc
            .fetchQuery({
              queryKey: ['people', 'worker-search', excludeAlumni, q],
              queryFn: () => workerEntity.source.search(q),
              staleTime: 30_000,
            })
            .then(dropExcluded),
        bootstrap: () => Promise.resolve(workerEntity.source.bootstrap()).then(dropExcluded),
        cancel: () => workerEntity.source.cancel?.(),
      },
      seed: (ids: string[]) =>
        ids.length === 0
          ? Promise.resolve([])
          : qc.fetchQuery({
              queryKey: ['people', 'worker-resolve', [...ids].sort()],
              queryFn: () => workerEntity.seed(ids),
              staleTime: 5 * 60_000,
            }),
    };
  }, [qc, excludeAlumni, excludeKey]);
}
