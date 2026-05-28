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

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional – using primitives (scope, workflowId) instead of queryKey (new array ref each render) to avoid infinite SSE reconnect loop
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
    // Use primitive deps (scope, workflowId) instead of queryKey (new array ref
    // each render) to avoid infinite SSE reconnection loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.scope, workflowId, qc]);

  return query;
}
