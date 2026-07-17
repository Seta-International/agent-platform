import { createHttpEntitySource, type SearchableItem, type SearchSource } from '@seta/shared-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

export type WorkerRow = { worker_id: string; full_name: string };

const workerEntity = createHttpEntitySource<WorkerRow>({
  path: '/api/people/v1/workers',
  extract: (j) => (j as { rows: WorkerRow[] }).rows,
  mapRow: (w) => ({ id: w.worker_id, label: w.full_name }),
});

export function useWorkerSource(): {
  source: SearchSource<SearchableItem>;
  seed: (ids: string[]) => Promise<SearchableItem[]>;
} {
  const qc = useQueryClient();
  return useMemo(
    () => ({
      source: {
        search: (q: string) =>
          qc.fetchQuery({
            queryKey: ['people', 'worker-search', q],
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
    }),
    [qc],
  );
}
