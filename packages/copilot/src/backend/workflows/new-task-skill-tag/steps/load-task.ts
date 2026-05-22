import { createStep } from '@mastra/core/workflows';
import { plannerGetTaskTool } from '../../../tools/planner.get-task.ts';
import { stateAfterLoadSchema, workflowInputSchema } from '../state-schema.ts';

interface TaskExecResult {
  task: {
    taskId: string;
    title: string;
    description: string | null;
    tenantId: string;
    groupId: string;
    skillTags: string[];
  };
}

export const loadTaskStep = createStep({
  id: 'load-task',
  inputSchema: workflowInputSchema,
  outputSchema: stateAfterLoadSchema,
  execute: async ({ inputData, requestContext }) => {
    const result = (await plannerGetTaskTool.execute?.({ taskId: inputData.taskRef.taskId }, {
      requestContext,
    } as Parameters<NonNullable<typeof plannerGetTaskTool.execute>>[1])) as TaskExecResult;
    return {
      taskRef: inputData.taskRef,
      initiatedBy: inputData.initiatedBy,
      task: {
        taskId: result.task.taskId,
        title: result.task.title,
        description: result.task.description,
        tenantId: result.task.tenantId,
        groupId: result.task.groupId,
        skillTags: result.task.skillTags,
      },
    };
  },
});
