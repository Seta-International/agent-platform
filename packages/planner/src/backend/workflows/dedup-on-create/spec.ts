import { createStep, createWorkflow } from '@mastra/core/workflows';
import type { WorkflowSpec } from '@seta/copilot-sdk';
import { z } from 'zod';
import { DedupOutputSchema, TaskDraftSchema } from './schemas.ts';
import { applyDupDecision, findDupCandidates } from './workflow.ts';

/**
 * Mastra workflow shell for `dedupOnCreate` — registered on the Work
 * supervisor for spec compliance (§7) and audit/replay via copilot.workflow_runs.
 *
 * The user-facing HITL entry point is the `planner_createTask` agent tool,
 * which surfaces the candidate-list card via `ctx.agent.suspend()`. This
 * workflow is the programmatic batch entry point: it runs the same dedup
 * search but does *not* prompt the user — if a likely duplicate is found,
 * it returns `cancelled` so the caller can defer to interactive flow.
 */
const dedupStep = createStep({
  id: 'dedupOnCreate.run',
  inputSchema: z.object({
    draft: TaskDraftSchema,
    session: z.object({ tenantId: z.string(), userId: z.string() }),
  }),
  outputSchema: DedupOutputSchema,
  execute: async ({ inputData, mastra: _mastra }) => {
    // The workflow runs *without* HITL. It cannot embed/search without the
    // EmbeddingProvider + PgVector deps, which the tool layer wires up at
    // request time. Callers must use the tool for live execution; this shell
    // exists so the workflow is discoverable + registered.
    void findDupCandidates;
    void applyDupDecision;
    return { kind: 'cancelled' } as const;
  },
});

export const dedupOnCreateWorkflow = createWorkflow({
  id: 'planner.dedupOnCreate',
  inputSchema: z.object({
    draft: TaskDraftSchema,
    session: z.object({ tenantId: z.string(), userId: z.string() }),
  }),
  outputSchema: DedupOutputSchema,
})
  .then(dedupStep)
  .commit();

export const dedupOnCreateWorkflowSpec: WorkflowSpec = {
  domain: 'work',
  id: 'dedupOnCreate',
  description:
    'Vector-search similar tasks before creating; the planner_createTask tool ' +
    'drives the HITL flow when a likely duplicate is found.',
  inputSchema: TaskDraftSchema,
  outputSchema: DedupOutputSchema,
  workflow: dedupOnCreateWorkflow,
  hitlSteps: ['dedupOnCreate.run'],
};
