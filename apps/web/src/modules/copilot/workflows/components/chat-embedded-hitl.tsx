import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type DecideApprovalBody, workflowsApi } from '../api/workflows.ts';
import { useThreadPendingApprovals } from '../hooks/use-thread-pending-approvals.ts';
import { workflowsQueryKeys } from '../state/query-keys.ts';
import { HitlApprovalCard } from './hitl-approval-card.tsx';

export interface ChatEmbeddedHitlProps {
  threadId: string | undefined;
}

export function ChatEmbeddedHitl({ threadId }: ChatEmbeddedHitlProps) {
  const approvalsQuery = useThreadPendingApprovals(threadId);
  const qc = useQueryClient();

  const decide = useMutation({
    mutationFn: (args: { approvalId: string } & DecideApprovalBody) =>
      workflowsApi.decideApproval(args.approvalId, {
        decision: args.decision,
        overrideUserId: args.overrideUserId,
        note: args.note,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: workflowsQueryKeys.pendingApprovals() });
      qc.invalidateQueries({ queryKey: workflowsQueryKeys.run(res.runId) });
    },
  });

  const approvals = approvalsQuery.data;
  if (!approvals || approvals.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="In-thread approvals">
      {approvals.map((approval) => (
        <HitlApprovalCard
          key={approval.approvalId}
          approval={approval}
          canAct
          pending={decide.isPending}
          onDecide={(args) => decide.mutate({ approvalId: approval.approvalId, ...args })}
        />
      ))}
    </section>
  );
}
