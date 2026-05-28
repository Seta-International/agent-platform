import { toast } from '@seta/shared-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type DecideApprovalBody, workflowsApi } from '../api/workflows.ts';
import { workflowsQueryKeys } from '../state/query-keys.ts';

export function useDecideApproval(runId: string) {
  const qc = useQueryClient();
  const invalidateRun = () => {
    qc.invalidateQueries({ queryKey: workflowsQueryKeys.run(runId) });
    qc.invalidateQueries({ queryKey: workflowsQueryKeys.runSnapshot(runId) });
    qc.invalidateQueries({ queryKey: workflowsQueryKeys.pendingApprovals() });
  };
  return useMutation({
    mutationFn: (args: { approvalId: string } & DecideApprovalBody) =>
      workflowsApi.decideApproval(args.approvalId, {
        decision: args.decision,
        overrideUserIds: args.overrideUserIds,
        alternateIndex: args.alternateIndex,
        alternateIndices: args.alternateIndices,
        note: args.note,
      }),
    onSuccess: (_data, args) => {
      invalidateRun();
      const label =
        args.decision === 'reject'
          ? 'Decision applied — task left unassigned.'
          : 'Decision applied — workflow is continuing.';
      toast.success('Decision applied', { description: label });
    },
    onError: (err: unknown) => {
      const status = (err as { status?: number } | null)?.status;
      const code = (err as { code?: string } | null)?.code;
      // The backend cancels the run on resume failure, so the latest state is
      // worth fetching either way.
      invalidateRun();
      if (status === 409 || code === 'already_decided') {
        toast.info('This approval was already decided. Refresh to see the latest state.');
        return;
      }
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      toast.error("Couldn't apply your decision", { description: message });
    },
  });
}
