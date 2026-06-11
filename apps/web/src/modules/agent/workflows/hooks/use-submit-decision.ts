import { useMutation } from '@tanstack/react-query';
import { workflowsApi } from '../api/workflows.ts';

export interface SubmitDecisionArgs {
  approvalId: string;
  agentic: boolean;
  decision: 'approve' | 'reject' | 'modify';
  overrideUserIds?: string[];
  alternateIndices?: number[];
  note?: string;
}

/**
 * Routes a HITL decision to the correct endpoint: agentic native-suspend cards
 * resume + re-stream via /chat/resume (records the decision AND continues the
 * run); evented cards resume inline via /decide.
 */
export function useSubmitDecision() {
  return useMutation({
    mutationFn: async ({ approvalId, agentic, ...decision }: SubmitDecisionArgs) =>
      agentic
        ? workflowsApi.resumeChat({ approvalId, ...decision })
        : workflowsApi.decideApproval(approvalId, decision),
  });
}
