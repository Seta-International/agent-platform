import { useMutation } from '@tanstack/react-query';
import { workflowsApi } from '../api/workflows.ts';

/** The body shape is decided by the CARD, not by this hook: the server parses it
 *  with the schema belonging to the approval's workflow_id and returns 400 on a
 *  mismatch (FUT-815). Both arms are forwarded unchanged — there is no branch
 *  here to keep in sync with either contract. */
export type SubmitDecisionArgs = { approvalId: string; agentic: boolean } & (
  | {
      decision: 'approve' | 'reject' | 'modify';
      overrideUserIds?: string[];
      alternateIndices?: number[];
      note?: string;
    }
  // Payload-free card (FUT-804 onwards): which action, never what.
  | { chosen: 'primary' | 'decline' }
);

/**
 * Routes a HITL decision to the correct endpoint: agentic native-suspend cards
 * resume + re-stream via /chat/resume (records the decision AND continues the
 * run); evented cards resume inline via /decide.
 */
export function useSubmitDecision() {
  return useMutation({
    mutationFn: async ({ approvalId, agentic, ...decision }: SubmitDecisionArgs) => {
      if ('chosen' in decision) {
        // /decide records a legacy decision and never resumes, so it has no
        // contract for `chosen`. A payload-free card only ever comes from a
        // native-suspend run; anything else is a projection bug, not a request
        // to translate the body.
        if (!agentic) throw new Error('a payload-free confirm cannot be sent to /decide');
        return workflowsApi.resumeChat({ approvalId, ...decision });
      }
      return agentic
        ? workflowsApi.resumeChat({ approvalId, ...decision })
        : workflowsApi.decideApproval(approvalId, decision);
    },
  });
}
