import { useMutation } from '@tanstack/react-query';
import { workflowsApi } from '../api/workflows.ts';

/** Every chat card now uses ONE body: which server-authored branch the user
 *  picked, never a value. The canvas keeps `decision`/`overrideUserIds` on
 *  /decide — a different route, a different component, untouched by FUT-806. */
export type SubmitDecisionArgs = {
  approvalId: string;
  agentic: boolean;
  chosen: 'primary' | 'alternate' | 'decline';
  alternateIndex?: number;
  note?: string;
};

export function useSubmitDecision() {
  return useMutation({
    mutationFn: async ({ approvalId, agentic, ...decision }: SubmitDecisionArgs) => {
      // /decide records a legacy decision and never resumes, so it has no
      // contract for `chosen`. A payload-free card only ever comes from a
      // native-suspend run; anything else is a projection bug, not a request to
      // translate the body.
      if (!agentic) throw new Error('a payload-free confirm cannot be sent to /decide');
      return workflowsApi.resumeChat({ approvalId, ...decision });
    },
  });
}
