import type { Mastra } from '@mastra/core';
import type { WorkflowBuilder } from '@seta/copilot-sdk';
import { registerNewTaskSkillTagWorkflow } from './new-task-skill-tag/index.ts';

const newTaskSkillTagBuilder: WorkflowBuilder = (mastra) => {
  registerNewTaskSkillTagWorkflow(mastra as Mastra);
};

export const staffingWorkflows: WorkflowBuilder[] = [newTaskSkillTagBuilder];
