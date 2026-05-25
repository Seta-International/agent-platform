import { createStep, createWorkflow } from '@mastra/core/workflows';
import type { PgVector } from '@mastra/pg';
import {
  ApprovalCardSchema,
  sessionFromRequestContext,
  type WorkflowSpec,
} from '@seta/copilot-sdk';
import { buildActorSession } from '@seta/identity';
import { type EmbeddingProvider, OpenAIEmbeddingProvider } from '@seta/shared-embeddings';
import { resolveReranker } from '@seta/shared-retrieval';
import { z } from 'zod';
import { assignTask } from '../../domain/assign-task.ts';
import { getPlannerVectorStore } from '../../embeddings/vector-store.ts';
import {
  AssignBySkillInputSchema,
  AssignBySkillOutputSchema,
  AssignDecisionSchema,
} from './schemas.ts';
import { applyAssignDecision, runSuggestAssignee } from './workflow.ts';

/**
 * Mastra workflow for `assignBySkill` — real createStep chain.
 *
 * Two-step shape:
 *   1. `assignBySkill.compute` — derives session from requestContext,
 *      delegates to runSuggestAssignee for the candidate ranking pipeline,
 *      passes the rendered ApprovalCard forward.
 *   2. `assignBySkill.suggest` (HITL) — suspends with the card on first
 *      invocation; on resume calls applyAssignDecision (which writes via
 *      planner_assignTask domain function and emits planner.task.assigned).
 *
 * Reached two ways:
 *   - Chat path: planner_suggestAssignee tool wraps the same orchestration
 *     functions (runSuggestAssignee + applyAssignDecision) directly — that
 *     path keeps its existing UX in PR1.
 *   - REST/button path: POST /api/copilot/v1/workflows/runs/assignBySkill/start
 *     (PR1 Task 8) drives this workflow; the lifecycle hook writes
 *     copilot.workflow_runs + workflow_approvals rows; users decide via
 *     /workflows/approvals/:id/decide.
 *
 * Session NEVER appears in the inputSchema (LLM-visible) — it derives from
 * requestContext server-side via sessionFromRequestContext. Enforced by
 * assertNoSessionField at registration time.
 */

let lazyProvider: EmbeddingProvider | undefined;
function getProvider(): EmbeddingProvider {
  if (lazyProvider) return lazyProvider;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY required for assignBySkill workflow');
  const model = (process.env.EMBED_MODEL ?? 'text-embedding-3-small') as
    | 'text-embedding-3-small'
    | 'text-embedding-3-large';
  lazyProvider = new OpenAIEmbeddingProvider({ apiKey, model });
  return lazyProvider;
}

function getPgVector(): PgVector {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL required for assignBySkill workflow');
  return getPlannerVectorStore(databaseUrl);
}

const ComputeOutputSchema = z.object({
  taskId: z.string().uuid(),
  card: ApprovalCardSchema,
});

const computeStep = createStep({
  id: 'assignBySkill.compute',
  inputSchema: AssignBySkillInputSchema,
  outputSchema: ComputeOutputSchema,
  execute: async ({ inputData, requestContext, runId }) => {
    const session = await sessionFromRequestContext(requestContext);
    const { card } = await runSuggestAssignee(
      {
        taskId: inputData.taskId,
        session: { tenantId: session.tenantId, userId: session.userId },
        toolCallId: `workflow:${runId}`,
      },
      {
        provider: getProvider(),
        pgVector: getPgVector(),
        reranker: resolveReranker(),
      },
    );
    return { taskId: inputData.taskId, card };
  },
});

const suggestStep = createStep({
  id: 'assignBySkill.suggest',
  inputSchema: ComputeOutputSchema,
  outputSchema: AssignBySkillOutputSchema,
  suspendSchema: ApprovalCardSchema,
  resumeSchema: AssignDecisionSchema,
  execute: async ({ inputData, resumeData, suspend, requestContext }) => {
    if (!resumeData) return suspend(inputData.card);
    const { userId } = await sessionFromRequestContext(requestContext);
    const fullSession = await buildActorSession({ user_id: userId });
    return applyAssignDecision(
      { taskId: inputData.taskId, decision: resumeData, session: fullSession },
      { assignTask },
    );
  },
});

export const assignBySkillWorkflow = createWorkflow({
  id: 'planner.assignBySkill',
  inputSchema: AssignBySkillInputSchema,
  outputSchema: AssignBySkillOutputSchema,
})
  .then(computeStep)
  .then(suggestStep)
  .commit();

export const assignBySkillWorkflowSpec: WorkflowSpec = {
  domain: 'work',
  id: 'assignBySkill',
  description:
    'Suggests an assignee for a task by skill overlap + vector match + task ' +
    'history + load + timezone; HITL via inbox approval (or planner_suggestAssignee tool in chat).',
  inputSchema: AssignBySkillInputSchema,
  outputSchema: AssignBySkillOutputSchema,
  workflow: assignBySkillWorkflow,
  hitlSteps: ['assignBySkill.suggest'],
};
