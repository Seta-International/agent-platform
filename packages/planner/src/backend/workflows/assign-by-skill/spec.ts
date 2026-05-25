import { createStep, createWorkflow } from '@mastra/core/workflows';
import type { WorkflowSpec } from '@seta/copilot-sdk';
import { z } from 'zod';
import { AssignBySkillInputSchema, AssignBySkillOutputSchema } from './schemas.ts';
import { runSuggestAssignee } from './workflow.ts';

/**
 * Mastra workflow shell for `assignBySkill` — registered on the Work
 * supervisor for spec compliance (§8) and audit/replay via copilot.workflow_runs.
 *
 * The user-facing HITL entry point is the `planner_suggestAssignee` agent
 * tool, which suspends the candidate-list card via `ctx.agent.suspend()` and
 * routes the resume payload through `planner_assignTask`. This shell exists
 * for registry discovery only; calling it directly returns 'declined' since
 * the embedding deps are not available at the workflow shell layer.
 */
const runStep = createStep({
  id: 'assignBySkill.run',
  inputSchema: z.object({
    taskId: z.string().uuid(),
    session: z.object({ tenantId: z.string(), userId: z.string() }),
  }),
  outputSchema: AssignBySkillOutputSchema,
  execute: async () => {
    void runSuggestAssignee;
    return { kind: 'declined' as const };
  },
});

export const assignBySkillWorkflow = createWorkflow({
  id: 'planner.assignBySkill',
  inputSchema: z.object({
    taskId: z.string().uuid(),
    session: z.object({ tenantId: z.string(), userId: z.string() }),
  }),
  outputSchema: AssignBySkillOutputSchema,
})
  .then(runStep)
  .commit();

export const assignBySkillWorkflowSpec: WorkflowSpec = {
  domain: 'work',
  id: 'assignBySkill',
  description:
    'Suggests an assignee for a task by skill overlap + vector match + task ' +
    'history + load + timezone; HITL required (planner_suggestAssignee tool).',
  inputSchema: AssignBySkillInputSchema,
  outputSchema: AssignBySkillOutputSchema,
  workflow: assignBySkillWorkflow,
  hitlSteps: ['assignBySkill.run'],
};
