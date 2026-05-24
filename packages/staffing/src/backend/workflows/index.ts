import type { Mastra } from '@mastra/core';
import type { WorkflowContribution } from '@seta/copilot-sdk';
import {
  NEW_TASK_SKILL_TAG_WORKFLOW_ID,
  registerNewTaskSkillTagWorkflow,
  workflowInputSchema,
} from './new-task-skill-tag/index.ts';

const newTaskSkillTagContribution: WorkflowContribution = {
  id: NEW_TASK_SKILL_TAG_WORKFLOW_ID,
  build: (mastra) => {
    registerNewTaskSkillTagWorkflow(mastra as Mastra);
  },
  inputSchema: workflowInputSchema,
};

export const staffingWorkflows: WorkflowContribution[] = [newTaskSkillTagContribution];
