import { createStep } from '@mastra/core/workflows';
import { plannerAssignTaskTool } from '@seta/planner/agent-tools';
import { stateAfterApprovalSchema, workflowOutputSchema } from '../state-schema.ts';

interface AssignExecResult {
  assignment: {
    taskId: string;
    assigneeUserId: string;
  };
}

export const assignStep = createStep({
  id: 'assign',
  inputSchema: stateAfterApprovalSchema,
  outputSchema: workflowOutputSchema,
  execute: async ({ inputData, requestContext }) => {
    if (inputData.decision !== 'approve' && inputData.decision !== 'modify') {
      return { decision: inputData.decision, assignment: null };
    }
    const assigneeUserId = inputData.overrideUserId ?? inputData.proposed?.userId;
    if (!assigneeUserId) {
      return { decision: inputData.decision, assignment: null };
    }
    const result = (await plannerAssignTaskTool.execute?.(
      {
        taskId: inputData.taskRef.taskId,
        assigneeUserId,
      },
      { requestContext } as Parameters<NonNullable<typeof plannerAssignTaskTool.execute>>[1],
    )) as AssignExecResult;
    return {
      decision: inputData.decision,
      assignment: {
        taskId: result.assignment.taskId,
        assigneeUserId: result.assignment.assigneeUserId,
      },
    };
  },
});
