import { Button, PageChrome } from '@seta/shared-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { workflowsApi } from '../api/workflows.ts';
import { HitlApprovalCard } from '../components/hitl-approval-card.tsx';
import { RunRightPanel } from '../components/run-right-panel.tsx';
import { RunStatusPill } from '../components/run-status-pill.tsx';
import { WorkflowGraph } from '../components/workflow-graph.tsx';
import { useDecideApproval } from '../hooks/use-decide-approval.ts';
import { usePendingApprovals } from '../hooks/use-pending-approvals.ts';
import { useWorkflowRun } from '../hooks/use-workflow-run.ts';
import { useWorkflowRunSnapshot } from '../hooks/use-workflow-run-snapshot.ts';
import { workflowsQueryKeys } from '../state/query-keys.ts';

const TERMINAL = new Set(['success', 'failed', 'tripwire', 'canceled']);

function workflowLabel(workflowId: string): string {
  return workflowId.replace(/^.*\./, '');
}

/**
 * Best-effort recovery of the ApprovalCard from the workflow snapshot when the
 * projection's workflow_approvals.proposed_payload is empty (legacy rows from
 * before the adapter was fixed). Mastra stores the suspend payload at
 * `snapshot.result.suspendPayload` (top-level for the most recently suspended
 * step) and under `snapshot.context[stepId].suspendPayload`. Either contains
 * the full card; primary first, then any suspended step.
 */
function cardFromSnapshot(snapshot: unknown): unknown {
  if (!snapshot || typeof snapshot !== 'object') return undefined;
  const snap = snapshot as {
    result?: { suspendPayload?: unknown };
    context?: Record<string, { suspendPayload?: unknown }>;
    suspendedPaths?: Record<string, unknown>;
  };
  if (snap.result?.suspendPayload && typeof snap.result.suspendPayload === 'object') {
    return snap.result.suspendPayload;
  }
  const suspendedStepId = snap.suspendedPaths ? Object.keys(snap.suspendedPaths)[0] : undefined;
  if (suspendedStepId && snap.context?.[suspendedStepId]?.suspendPayload) {
    return snap.context[suspendedStepId].suspendPayload;
  }
  // Fallback: scan context for any entry with a suspendPayload.
  if (snap.context) {
    for (const entry of Object.values(snap.context)) {
      if (entry?.suspendPayload && typeof entry.suspendPayload === 'object') {
        return entry.suspendPayload;
      }
    }
  }
  return undefined;
}

export interface WorkflowRunPageProps {
  runId: string;
}

export function WorkflowRunPage({ runId }: WorkflowRunPageProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const runQuery = useWorkflowRun(runId);
  const workflowsBreadcrumb = [
    <Link
      key="agent"
      to="/agent/workflows"
      className="rounded px-1 py-0.5 hover:bg-surface-1 hover:text-ink"
    >
      Agent
    </Link>,
    <Link
      key="workflows"
      to="/agent/workflows"
      className="rounded px-1 py-0.5 hover:bg-surface-1 hover:text-ink"
    >
      Workflows
    </Link>,
  ] as const;
  const snapshotQuery = useWorkflowRunSnapshot(runId);
  const approvalsQuery = usePendingApprovals();
  const decide = useDecideApproval(runId);

  const onReplay = useCallback(
    async (args: { stepId: string; originalPayload: unknown }) => {
      const out = await workflowsApi.replayFromStep(
        runId,
        args.stepId,
        (args.originalPayload ?? {}) as Record<string, unknown>,
      );
      if (out.newRunId === runId) {
        // timeTravel replays in-place — invalidate so the graph, status, and
        // pending approvals all refresh from the freshly-committed DB state.
        await Promise.all([
          qc.invalidateQueries({ queryKey: workflowsQueryKeys.run(runId) }),
          qc.invalidateQueries({ queryKey: workflowsQueryKeys.runSnapshot(runId) }),
          qc.invalidateQueries({ queryKey: workflowsQueryKeys.pendingApprovals() }),
        ]);
      } else {
        void navigate({
          to: '/agent/workflows/runs/$runId',
          params: { runId: out.newRunId },
          search: {},
        });
      }
    },
    [runId, navigate, qc],
  );

  const rerunMutation = useMutation({
    mutationFn: () => workflowsApi.rerunRun(runId),
    onSuccess: (out) => {
      void navigate({
        to: '/agent/workflows/runs/$runId',
        params: { runId: out.newRunId },
        search: {},
      });
    },
  });

  if (runQuery.isLoading) {
    return (
      <PageChrome breadcrumb={workflowsBreadcrumb} title="Loading run…">
        <div className="p-8 text-sm text-ink-subtle">Loading run…</div>
      </PageChrome>
    );
  }
  if (!runQuery.data) {
    return (
      <PageChrome breadcrumb={workflowsBreadcrumb} title="Run not found">
        <div className="grid h-full place-items-center p-8 text-sm">
          <div className="space-y-2 text-center">
            <p className="text-ink">We couldn&apos;t find that run.</p>
            <p className="text-xs text-ink-subtle">
              It may have been deleted, or you might not have access.
            </p>
          </div>
        </div>
      </PageChrome>
    );
  }

  const run = runQuery.data;
  const myApproval = approvalsQuery.data?.find((a) => a.runId === runId) ?? null;
  const terminal = TERMINAL.has(run.status);

  return (
    <PageChrome
      breadcrumb={workflowsBreadcrumb}
      title={<span className="font-mono">{workflowLabel(run.workflowId)}</span>}
      subtitle={
        <>
          <span className="font-mono text-xs">Run {run.runId.slice(0, 7)}</span>
          <RunStatusPill status={run.status} />
        </>
      }
      actions={
        terminal ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={rerunMutation.isPending}
            onClick={() => rerunMutation.mutate()}
          >
            {rerunMutation.isPending ? 'Replaying…' : 'Replay from start'}
          </Button>
        ) : undefined
      }
    >
      <div className="flex h-full flex-1 overflow-hidden">
        <main className="relative flex-1 overflow-hidden bg-surface-2">
          <WorkflowGraph
            snapshot={snapshotQuery.data}
            run={{
              runId: run.runId,
              startedAt: run.startedAt,
              finishedAt: run.finishedAt,
              status: run.status,
            }}
            onReplay={onReplay}
          />
          {run.status === 'paused' && myApproval ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
              <div className="pointer-events-auto w-full max-w-xl">
                <HitlApprovalCard
                  approval={myApproval}
                  // Snapshot fallback: legacy approval rows have empty
                  // proposed_payload because the adapter wasn't extracting the
                  // suspend payload. The Mastra snapshot still has the full card
                  // under .result.suspendPayload (and .context[step].suspendPayload),
                  // so the UI can recover the candidate list from there.
                  proposedPayloadFallback={cardFromSnapshot(snapshotQuery.data)}
                  canAct
                  pending={decide.isPending}
                  onDecide={(args) => decide.mutate({ approvalId: myApproval.approvalId, ...args })}
                />
              </div>
            </div>
          ) : null}
        </main>
        <RunRightPanel
          run={run}
          streamEvents={runQuery.streamEvents}
          snapshot={snapshotQuery.data}
        />
      </div>
    </PageChrome>
  );
}
