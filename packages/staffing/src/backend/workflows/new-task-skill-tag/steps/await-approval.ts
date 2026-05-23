import { createStep } from '@mastra/core/workflows';
import {
  awaitApprovalResumeSchema,
  awaitApprovalSuspendSchema,
  stateAfterApprovalSchema,
  stateAfterProposeSchema,
} from '../state-schema.ts';

const APPROVAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const awaitApprovalStep = createStep({
  id: 'await-approval',
  inputSchema: stateAfterProposeSchema,
  outputSchema: stateAfterApprovalSchema,
  resumeSchema: awaitApprovalResumeSchema,
  suspendSchema: awaitApprovalSuspendSchema,
  execute: async ({ inputData, resumeData, suspend }) => {
    if (!resumeData) {
      return (await suspend({
        proposedPayload: inputData.proposed,
        approverUserId: inputData.initiatedBy.userId,
        fallbackApproverUserId: null,
        surfaceCanvas: true,
        surfaceChatThreadId: inputData.initiatedBy.threadId ?? null,
        expiresAt: new Date(Date.now() + APPROVAL_TTL_MS).toISOString(),
        suspendReason: inputData.failureReason ?? 'hitl_pending',
        stepId: 'await-approval',
      })) as never;
    }
    return {
      ...inputData,
      decision: resumeData.decision,
      overrideUserId: resumeData.overrideUserId,
      note: resumeData.note,
    };
  },
});
