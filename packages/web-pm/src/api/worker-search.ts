import { createHttpEntitySource, type SearchableItem, type SearchSource } from '@seta/shared-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

export type WorkerRow = { worker_id: string; full_name: string };

/**
 * FUT-953 (AC1): pass `excludeAlumni: true` for any picker used to CREATE a new
 * allocation — alumni employees must not be selectable there. Pickers for other
 * purposes (account manager, project access, PM lead) must stay unfiltered: those
 * still need to reach a worker who has since become alumni (AC2's spirit).
 */
export function useWorkerSource(opts?: { excludeAlumni?: boolean }): {
  source: SearchSource<SearchableItem>;
  seed: (ids: string[]) => Promise<SearchableItem[]>;
} {
  const qc = useQueryClient();
  const excludeAlumni = opts?.excludeAlumni ?? false;
  return useMemo(() => {
    const workerEntity = createHttpEntitySource<WorkerRow>({
      path: '/api/people/v1/workers',
      extract: (j) => (j as { rows: WorkerRow[] }).rows,
      mapRow: (w) => ({ id: w.worker_id, label: w.full_name }),
      extraParams: excludeAlumni ? { exclude_status: 'alumni' } : undefined,
    });
    return {
      source: {
        search: (q: string) =>
          qc.fetchQuery({
            queryKey: ['people', 'worker-search', excludeAlumni, q],
            queryFn: () => workerEntity.source.search(q),
            staleTime: 30_000,
          }),
        bootstrap: () => workerEntity.source.bootstrap(),
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
  }, [qc, excludeAlumni]);
}
