import { Button, PageChrome } from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { HitlApprovalCard } from '../components/hitl-approval-card.tsx';
import { RerunSideSheet } from '../components/rerun-side-sheet.tsx';
import { RunRightPanel } from '../components/run-right-panel.tsx';
import { RunStatusPill } from '../components/run-status-pill.tsx';
import { WorkflowGraph } from '../components/workflow-graph.tsx';
import { useDecideApproval } from '../hooks/use-decide-approval.ts';
import { usePendingApprovals } from '../hooks/use-pending-approvals.ts';
import { useWorkflowRun } from '../hooks/use-workflow-run.ts';
import { useWorkflowRunSnapshot } from '../hooks/use-workflow-run-snapshot.ts';

const TERMINAL = new Set(['success', 'failed', 'tripwire', 'canceled']);

function workflowLabel(workflowId: string): string {
  return workflowId.replace(/^.*\./, '');
}

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
    return (
      <PageChrome breadcrumb={['Copilot', 'Workflows']} title="Loading run…">
        <div className="p-8 text-sm text-ink-subtle">Loading run…</div>
      </PageChrome>
    );
  }
  if (!runQuery.data) {
    return (
      <PageChrome breadcrumb={['Copilot', 'Workflows']} title="Run not found">
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
      breadcrumb={['Copilot', 'Workflows']}
      title={<span className="font-mono">{workflowLabel(run.workflowId)}</span>}
      subtitle={
        <>
          <span className="font-mono text-xs">Run {run.runId.slice(0, 7)}</span>
          <RunStatusPill status={run.status} />
        </>
      }
      actions={
        terminal ? (
          <Button size="sm" variant="secondary" onClick={openRerun}>
            Run again
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
    </PageChrome>
  );
}
