import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { workflowsApi } from '../api/workflows.ts';
import { type WorkflowRunScope, workflowsQueryKeys } from '../state/query-keys.ts';

const PAGE_SIZE = 25;

export interface UseWorkflowRunsOpts {
  scope: WorkflowRunScope;
  workflowId?: string | null;
}

export function useWorkflowRuns(opts: UseWorkflowRunsOpts) {
  const qc = useQueryClient();
  const workflowId = opts.workflowId ?? null;
  const queryKey = workflowsQueryKeys.runs(opts.scope, workflowId);
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      workflowsApi.listRuns({
        scope: opts.scope,
        cursor: pageParam ?? undefined,
        limit: PAGE_SIZE,
        workflowId: workflowId ?? undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;

    void (async () => {
      let token: string;
      try {
        token = await workflowsApi.issueSseToken();
      } catch {
        return;
      }
      if (cancelled) return;
      const url = `/api/agent/workflows/runs/stream?scope=${encodeURIComponent(
        opts.scope,
      )}&token=${encodeURIComponent(token)}`;
      es = new EventSource(url);
      const invalidate = () => {
        qc.invalidateQueries({ queryKey });
      };
      es.addEventListener('run.created', invalidate);
      es.addEventListener('run.status_changed', invalidate);
    })();

    return () => {
      cancelled = true;
      es?.close();
    };
  }, [opts.scope, qc, queryKey]);

  return query;
}
