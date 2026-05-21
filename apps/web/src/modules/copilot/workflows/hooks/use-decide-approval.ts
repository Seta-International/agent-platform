import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type DecideApprovalBody, workflowsApi } from '../api/workflows.ts';
import { workflowsQueryKeys } from '../state/query-keys.ts';

export function useDecideApproval(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { approvalId: string } & DecideApprovalBody) =>
      workflowsApi.decideApproval(args.approvalId, {
        decision: args.decision,
        overrideUserId: args.overrideUserId,
        note: args.note,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workflowsQueryKeys.run(runId) });
      qc.invalidateQueries({ queryKey: workflowsQueryKeys.runSnapshot(runId) });
      qc.invalidateQueries({ queryKey: workflowsQueryKeys.pendingApprovals() });
    },
  });
}
