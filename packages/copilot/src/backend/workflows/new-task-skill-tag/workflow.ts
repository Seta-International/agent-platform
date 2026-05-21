import { createWorkflow } from '@mastra/core/workflows/evented';
import { workflowInputSchema, workflowOutputSchema } from './state-schema.ts';
import { assignStep } from './steps/assign.ts';
import { awaitApprovalStep } from './steps/await-approval.ts';
import { classifySkillsStep } from './steps/classify-skills.ts';
import { findCandidatesStep } from './steps/find-candidates.ts';
import { loadTaskStep } from './steps/load-task.ts';
import { proposeAssigneeStep } from './steps/propose-assignee.ts';

export const NEW_TASK_SKILL_TAG_WORKFLOW_ID = 'copilot.new-task-skill-tag';

export const newTaskSkillTagWorkflow = createWorkflow({
  id: NEW_TASK_SKILL_TAG_WORKFLOW_ID,
  inputSchema: workflowInputSchema,
  outputSchema: workflowOutputSchema,
})
  .then(loadTaskStep)
  .then(classifySkillsStep)
  .then(findCandidatesStep)
  .then(proposeAssigneeStep)
  .then(awaitApprovalStep)
  .then(assignStep)
  .commit();
