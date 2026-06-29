import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { WorkflowApprovalRow } from '../api/schemas.ts';
import { type DecideApprovalBody, workflowsApi } from '../api/workflows.ts';
import { useThreadApprovals } from '../hooks/use-thread-approvals.ts';
import { workflowsQueryKeys } from '../state/query-keys.ts';
import { isDedupApprovalPayload } from './approval-card-shape.ts';
import { cardIntent, cardToolId, outcomeText, STATUS_LABELS } from './decided-approval.ts';
import { HitlApprovalCard } from './hitl-approval-card.tsx';
import { HitlCardHost } from './hitl-card-host.tsx';

export interface ChatEmbeddedHitlProps {
  threadId: string | undefined;
}

function DecidedRow({ approval }: { approval: WorkflowApprovalRow }) {
  const label = STATUS_LABELS[approval.status] ?? approval.status;
  const intent = cardIntent(approval.proposedPayload);
  const positive = approval.status === 'approved' || approval.status === 'modified';

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-hairline bg-surface-1 px-3.5 py-2.5">
      {positive ? (
        <CheckCircle2 className="mt-px size-4 shrink-0 text-semantic-success" aria-hidden />
      ) : (
        <XCircle className="mt-px size-4 shrink-0 text-ink-subtle" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 text-body-sm">
          <span className="font-medium text-ink">{label}.</span>
          {intent ? <span className="truncate text-ink-subtle">{intent}</span> : null}
        </div>
        <p className="mt-0.5 text-caption text-ink-subtle">{outcomeText(approval)}</p>
      </div>
    </div>
  );
}

export function ChatEmbeddedHitl({ threadId }: ChatEmbeddedHitlProps) {
  const approvalsQuery = useThreadApprovals(threadId);
  const queryClient = useQueryClient();

  const decide = useMutation({
    mutationFn: (args: { approvalId: string; toolId: string | null } & DecideApprovalBody) =>
      workflowsApi.decideApproval(args.approvalId, {
        decision: args.decision,
        overrideUserIds: args.overrideUserIds,
        note: args.note,
      }),
    onSuccess: (_data, args) => {
      // Deliberately NO thread append here: the decision is already complete
      // server-side (decide-approval ran the planner decider — assigns on
      // approve, does nothing on reject). Appending a chat message would start
      // a new agent turn and re-run the orchestrator pipeline.
      if (threadId) {
        void queryClient.invalidateQueries({
          queryKey: workflowsQueryKeys.threadApprovals(threadId),
        });
      }
      void queryClient.invalidateQueries({ queryKey: workflowsQueryKeys.pendingApprovals() });
      // The chat-HITL decider already executed the underlying write before the
      // decide call returned (e.g. planner assignTask), so the owning module's
      // query cache is stale. Tool ids are namespaced `<module>_<action>` and
      // every web module roots its query keys at ['<module>'] — invalidating
      // that namespace refreshes whatever views the write touched (task detail
      // assignees, boards, my-tasks) without coupling this module to them.
      const moduleNs = args.toolId?.split('_')[0];
      if (moduleNs) void queryClient.invalidateQueries({ queryKey: [moduleNs] });
    },
  });

  const approvals = approvalsQuery.data;
  if (!approvals || approvals.length === 0) return null;

  // Bridge between decide success and the invalidated refetch landing: render
  // the just-decided card as its decided row instead of the interactive card.
  const justDecided =
    decide.isSuccess && decide.variables
      ? {
          approvalId: decide.variables.approvalId,
          status: (decide.variables.decision === 'approve'
            ? 'approved'
            : decide.variables.decision === 'modify'
              ? 'modified'
              : 'rejected') as WorkflowApprovalRow['status'],
          decisionPayload: {
            decision: decide.variables.decision,
            ...(decide.variables.overrideUserIds
              ? { override_user_ids: decide.variables.overrideUserIds }
              : {}),
          },
        }
      : null;

  return (
    <section className="space-y-3" aria-label="In-thread approvals">
      {approvals.map((approval) => {
        if (approval.status !== 'pending') {
          return <DecidedRow key={approval.approvalId} approval={approval} />;
        }
        if (justDecided && justDecided.approvalId === approval.approvalId) {
          return (
            <DecidedRow
              key={approval.approvalId}
              approval={{
                ...approval,
                status: justDecided.status,
                decisionPayload: justDecided.decisionPayload,
              }}
            />
          );
        }
        if (isDedupApprovalPayload(approval.proposedPayload)) {
          return (
            <HitlApprovalCard
              key={approval.approvalId}
              approval={approval}
              canAct
              pending={decide.isPending && decide.variables?.approvalId === approval.approvalId}
              onDecide={(args) =>
                decide.mutate({
                  approvalId: approval.approvalId,
                  toolId: cardToolId(approval.proposedPayload),
                  ...args,
                })
              }
            />
          );
        }
        // Non-dedup cards submit through HitlCardHost's own useSubmitDecision
        // (which routes agentic → /chat/resume); it self-invalidates on success,
        // so the justDecided bridge above stays scoped to the legacy dedup path.
        return (
          <HitlCardHost key={approval.approvalId} approval={approval} canAct threadId={threadId} />
        );
      })}
    </section>
  );
}
