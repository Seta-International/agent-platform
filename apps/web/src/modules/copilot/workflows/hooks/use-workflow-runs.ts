import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { workflowsApi } from '../api/workflows.ts';
import { type WorkflowRunScope, workflowsQueryKeys } from '../state/query-keys.ts';

export function useWorkflowRuns(opts: { scope: WorkflowRunScope }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: workflowsQueryKeys.runs(opts.scope),
    queryFn: () => workflowsApi.listRuns({ scope: opts.scope }),
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
      const url = `/api/copilot/workflows/runs/stream?scope=${encodeURIComponent(
        opts.scope,
      )}&token=${encodeURIComponent(token)}`;
      es = new EventSource(url);
      const invalidate = () => {
        qc.invalidateQueries({ queryKey: workflowsQueryKeys.runs(opts.scope) });
      };
      es.addEventListener('run.created', invalidate);
      es.addEventListener('run.status_changed', invalidate);
    })();

    return () => {
      cancelled = true;
      es?.close();
    };
  }, [opts.scope, qc]);

  return query;
}
