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
          const raw = JSON.parse(ev.data) as Omit<WorkflowRunStreamEvent, 'seq'>;
          setStreamEvents((prev) => [...prev, { ...raw, seq: prev.length }]);
          const data = raw;
          if (
            data.kind === 'run-completed' ||
            data.kind === 'run-failed' ||
            data.kind === 'run-canceled' ||
            data.kind === 'run-suspended' ||
            data.kind === 'run-resumed'
          ) {
            qc.invalidateQueries({ queryKey: workflowsQueryKeys.run(runId) });
            qc.invalidateQueries({ queryKey: workflowsQueryKeys.runSnapshot(runId) });
            qc.invalidateQueries({ queryKey: workflowsQueryKeys.pendingApprovals() });
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
