import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { workflowsApi } from '../api/workflows.ts';
import { workflowsQueryKeys } from '../state/query-keys.ts';

const TERMINAL_STATUSES = new Set(['success', 'failed', 'tripwire', 'canceled']);

export interface WorkflowRunStreamEvent {
  seq: number;
  kind: string;
  payload: unknown;
}

export function useWorkflowRun(runId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: workflowsQueryKeys.run(runId),
    queryFn: () => workflowsApi.getRun(runId),
    enabled: Boolean(runId),
  });

  const [streamEvents, setStreamEvents] = useState<WorkflowRunStreamEvent[]>([]);
  const runStatus = query.data?.status;

  useEffect(() => {
    if (!runId) return;
    if (runStatus && TERMINAL_STATUSES.has(runStatus)) return;

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
      const url = `/api/agent/workflows/runs/${encodeURIComponent(runId)}/stream?token=${encodeURIComponent(token)}`;
      es = new EventSource(url);
      es.onmessage = (ev) => {
        try {
          const raw = JSON.parse(ev.data) as Omit<WorkflowRunStreamEvent, 'seq'> & {
            type?: string;
          };
          setStreamEvents((prev) => [...prev, { ...raw, seq: prev.length }]);
          const t = raw.type ?? '';
          // Invalidate run + approvals on terminal / suspension state changes.
          // Mastra WorkflowStreamEvent types use hyphens: workflow-finish, workflow-canceled, etc.
          if (t === 'workflow-finish' || t === 'workflow-canceled' || t === 'workflow-paused') {
            qc.invalidateQueries({ queryKey: workflowsQueryKeys.run(runId) });
            qc.invalidateQueries({ queryKey: workflowsQueryKeys.runSnapshot(runId) });
            qc.invalidateQueries({ queryKey: workflowsQueryKeys.pendingApprovals() });
            // The DB write (lifecycle hook) runs on a separate pubsub channel and
            // may not have committed yet when the client refetches above.
            // Re-invalidate after a short delay to pick up the committed state.
            setTimeout(() => {
              qc.invalidateQueries({ queryKey: workflowsQueryKeys.run(runId) });
              qc.invalidateQueries({ queryKey: workflowsQueryKeys.runSnapshot(runId) });
              qc.invalidateQueries({ queryKey: workflowsQueryKeys.pendingApprovals() });
            }, 800);
          } else if (t === 'workflow-step-suspended') {
            // A HITL step suspended. The lifecycle hook writes status=paused +
            // the approval row to the DB via the separate 'workflows' pubsub
            // channel. Invalidate run + approvals with a delay to let that
            // DB write commit before we refetch.
            qc.invalidateQueries({ queryKey: workflowsQueryKeys.runSnapshot(runId) });
            setTimeout(() => {
              qc.invalidateQueries({ queryKey: workflowsQueryKeys.run(runId) });
              qc.invalidateQueries({ queryKey: workflowsQueryKeys.runSnapshot(runId) });
              qc.invalidateQueries({ queryKey: workflowsQueryKeys.pendingApprovals() });
            }, 800);
          } else if (t.startsWith('workflow-step')) {
            // Refresh the snapshot as steps progress so the graph updates live.
            qc.invalidateQueries({ queryKey: workflowsQueryKeys.runSnapshot(runId) });
          }
        } catch {
          // Ignore malformed payloads — server may send heartbeat events too.
        }
      };
    })();

    return () => {
      cancelled = true;
      es?.close();
    };
  }, [runId, runStatus, qc]);

  return { ...query, streamEvents };
}
