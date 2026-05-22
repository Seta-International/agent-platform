import { useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { HitlApprovalCard } from '../components/hitl-approval-card.tsx';
import { RerunSideSheet } from '../components/rerun-side-sheet.tsx';
import { RunHeader } from '../components/run-header.tsx';
import { RunRightPanel } from '../components/run-right-panel.tsx';
import { WorkflowGraph } from '../components/workflow-graph.tsx';
import { useDecideApproval } from '../hooks/use-decide-approval.ts';
import { usePendingApprovals } from '../hooks/use-pending-approvals.ts';
import { useWorkflowRun } from '../hooks/use-workflow-run.ts';
import { useWorkflowRunSnapshot } from '../hooks/use-workflow-run-snapshot.ts';

export interface WorkflowRunPageProps {
  runId: string;
  rerunOpen?: boolean;
}

export function WorkflowRunPage({ runId, rerunOpen = false }: WorkflowRunPageProps) {
  const navigate = useNavigate();
  const runQuery = useWorkflowRun(runId);
  const snapshotQuery = useWorkflowRunSnapshot(runId);
  const approvalsQuery = usePendingApprovals();
  const decide = useDecideApproval(runId);
  const [replayCtx, setReplayCtx] = useState<{
    stepId: string;
    originalPayload: unknown;
  } | null>(null);

  const onReplay = useCallback(
    (args: { stepId: string; originalPayload: unknown }) => setReplayCtx(args),
    [],
  );

  const openRerun = () =>
    void navigate({
      to: '/copilot/workflows/runs/$runId',
      params: { runId },
      search: { rerun: '1' },
    });
  const closeRerun = () =>
    void navigate({
      to: '/copilot/workflows/runs/$runId',
      params: { runId },
      search: {},
    });
  const closeSheet = () => {
    if (replayCtx) setReplayCtx(null);
    if (rerunOpen) closeRerun();
  };

  if (runQuery.isLoading) {
    return <div className="p-8 text-sm text-[var(--color-ink-subtle)]">Loading run…</div>;
  }
  if (!runQuery.data) {
    return (
      <div className="grid h-full place-items-center p-8 text-sm">
        <div className="space-y-2 text-center">
          <p className="text-[var(--color-ink)]">Run not found.</p>
          <p className="text-xs text-[var(--color-ink-subtle)]">
            It may have been deleted or you may not have access.
          </p>
        </div>
      </div>
    );
  }

  const run = runQuery.data;
  const myApproval = approvalsQuery.data?.find((a) => a.runId === runId) ?? null;

  return (
    <div className="flex h-full flex-col">
      <RunHeader run={run} onRerun={openRerun} />
      <div className="flex flex-1 overflow-hidden">
        <main className="relative flex-1 overflow-hidden bg-[var(--color-surface-2)]">
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
      <RerunSideSheet
        open={rerunOpen || replayCtx !== null}
        mode={replayCtx ? 'replay-from-step' : 'rerun'}
        replayContext={replayCtx ?? undefined}
        runId={runId}
        workflowId={run.workflowId}
        priorInputSummary={run.inputSummary}
        onClose={closeSheet}
      />
    </div>
  );
}
