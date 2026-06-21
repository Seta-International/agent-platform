import { createHttpEntitySearch, type EntityOption } from '@seta/shared-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

export type WorkerRow = { worker_id: string; full_name: string };

export const workerSearch = createHttpEntitySearch<WorkerRow>({
  path: '/api/people/v1/workers',
  extract: (j) => (j as { rows: WorkerRow[] }).rows,
  mapRow: (w) => ({ value: w.worker_id, label: w.full_name }),
});

export function useWorkerSearch(): {
  search: (q: string) => Promise<EntityOption[]>;
  resolveByIds: (ids: string[]) => Promise<EntityOption[]>;
} {
  const qc = useQueryClient();
  return useMemo(
    () => ({
      search: (q: string) =>
        qc.fetchQuery({
          queryKey: ['people', 'worker-search', q],
          queryFn: () => workerSearch.search(q),
          staleTime: 30_000,
        }),
      resolveByIds: (ids: string[]) =>
        ids.length === 0
          ? Promise.resolve([])
          : qc.fetchQuery({
              queryKey: ['people', 'worker-resolve', [...ids].sort()],
              queryFn: () => workerSearch.resolveByIds(ids),
              staleTime: 5 * 60_000,
            }),
    }),
    [qc],
  );
}
