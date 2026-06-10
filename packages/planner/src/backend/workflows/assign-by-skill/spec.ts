import { createStep } from '@mastra/core/workflows';
// IMPORTANT: use the evented engine — it's the only path that publishes
// workflow.start / workflow.suspend / workflow.end events on the `workflows`
// pubsub topic, which agent's lifecycle hook projects into agent.workflow_runs
// and agent.workflow_approvals. The default engine runs inline and never
// emits those events, leaving runs stuck in the projected `running` state.
import { createWorkflow } from '@mastra/core/workflows/evented';
import type { PgVector } from '@mastra/pg';
import {
  ApprovalCardSchema,
  getPendingAssignRunIdForTask,
  sessionFromRequestContext,
  type WorkflowSpec,
} from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { type EmbeddingProvider, resolveEmbeddingProvider } from '@seta/shared-embeddings';
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

function getProvider(): EmbeddingProvider {
  return resolveEmbeddingProvider();
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
  description:
    'Ranks candidates by skill overlap, vector similarity, task history, load and timezone.',
  inputSchema: AssignBySkillInputSchema,
  outputSchema: ComputeOutputSchema,
  execute: async ({ inputData, requestContext, runId }) => {
    const session = await sessionFromRequestContext(requestContext);
    const { card } = await runSuggestAssignee(
      {
        taskId: inputData.taskId,
        session: {
          tenantId: session.tenantId,
          userId: session.userId,
          roleSummary: session.roleSummary,
        },
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
  description:
    'Presents the top candidate for human approval; suspends until a decision is received.',
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
  retryConfig: { attempts: 2, delay: 1000 },
  options: {
    onError: ({ runId, workflowId, error, requestContext, logger }) => {
      const tenantId = requestContext.get('tenant_id') as string | undefined;
      logger.error('workflow failed', {
        runId,
        workflowId,
        tenantId,
        errorName: error?.name,
        errorMessage: error?.message,
      });
    },
  },
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
  // Domain contract (spec §5.8): at most one pending assignment proposal per
  // task at a time. Enforced server-side so duplicate /start requests
  // (double-clicks, parallel tabs, retried POSTs) return the in-flight runId
  // instead of spawning a second workflow run.
  dedupeKey: async (input, session) => {
    const parsed = AssignBySkillInputSchema.safeParse(input);
    if (!parsed.success) return null;
    return getPendingAssignRunIdForTask({
      taskId: parsed.data.taskId,
      tenantId: session.tenant_id,
    });
  },
};
