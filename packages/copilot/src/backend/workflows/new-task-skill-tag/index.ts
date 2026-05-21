import type { Mastra } from '@mastra/core';
import { NEW_TASK_SKILL_TAG_WORKFLOW_ID, newTaskSkillTagWorkflow } from './workflow.ts';

export { NEW_TASK_SKILL_TAG_WORKFLOW_ID, newTaskSkillTagWorkflow };

export function registerNewTaskSkillTagWorkflow(mastra: Mastra): void {
  mastra.addWorkflow(newTaskSkillTagWorkflow);
}
