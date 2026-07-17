import {
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  Text,
  VStack,
} from '@seta/shared-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
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
  const snapshotQuery = useWorkflowRunSnapshot(runId);
  const approvalsQuery = usePendingApprovals();
  const decide = useDecideApproval(runId, { workflowHint: runQuery.data?.workflowId });

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
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={4}>
            <VStack gap={1}>
              <Breadcrumbs variant="supporting">
                <BreadcrumbItem href="/agent">Agent Studio</BreadcrumbItem>
                <BreadcrumbItem href="/agent/workflows">Workflows</BreadcrumbItem>
                <BreadcrumbItem isCurrent>Loading run…</BreadcrumbItem>
              </Breadcrumbs>
              <Text as="h1" size="lg" weight="semibold">
                Loading run…
              </Text>
            </VStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0}>
            <div className="p-8 text-sm text-secondary">Loading run…</div>
          </LayoutContent>
        }
      />
    );
  }
  if (!runQuery.data) {
    return (
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={4}>
            <VStack gap={1}>
              <Breadcrumbs variant="supporting">
                <BreadcrumbItem href="/agent">Agent Studio</BreadcrumbItem>
                <BreadcrumbItem href="/agent/workflows">Workflows</BreadcrumbItem>
                <BreadcrumbItem isCurrent>Run not found</BreadcrumbItem>
              </Breadcrumbs>
              <Text as="h1" size="lg" weight="semibold">
                Run not found
              </Text>
            </VStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0}>
            <div className="grid h-full place-items-center p-8 text-sm">
              <div className="space-y-2 text-center">
                <p className="text-primary">We couldn&apos;t find that run.</p>
                <p className="text-xs text-secondary">
                  It may have been deleted, or you might not have access.
                </p>
              </div>
            </div>
          </LayoutContent>
        }
      />
    );
  }

  const run = runQuery.data;
  const myApproval = approvalsQuery.data?.find((a) => a.runId === runId) ?? null;
  const terminal = TERMINAL.has(run.status);

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/agent">Agent Studio</BreadcrumbItem>
              <BreadcrumbItem href="/agent/workflows">Workflows</BreadcrumbItem>
              <BreadcrumbItem isCurrent>{workflowLabel(run.workflowId)}</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <HStack gap={2} vAlign="center">
                <Text as="h1" size="lg" weight="semibold">
                  <span className="font-mono">{workflowLabel(run.workflowId)}</span>
                </Text>
                <Text color="secondary">
                  <span className="font-mono text-xs">Run {run.runId.slice(0, 7)}</span>
                </Text>
                <RunStatusPill status={run.status} />
              </HStack>
              {terminal && (
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={rerunMutation.isPending}
                  onClick={() => rerunMutation.mutate()}
                  label={rerunMutation.isPending ? 'Replaying…' : 'Replay from start'}
                />
              )}
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <div className="flex h-full flex-1 overflow-hidden">
            <main className="relative flex-1 overflow-hidden bg-surface">
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
                      onDecide={(args) =>
                        decide.mutate({ approvalId: myApproval.approvalId, ...args })
                      }
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
        </LayoutContent>
      }
    />
  );
}
