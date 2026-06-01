import { createStep } from '@mastra/core/workflows';
// Use the evented engine so workflow.start / .suspend / .end land on the
// `workflows` pubsub topic that agent's lifecycle hook projects.
import { createWorkflow } from '@mastra/core/workflows/evented';
import type { PgVector } from '@mastra/pg';
import { ApprovalCardSchema, sessionFromRequestContext, type WorkflowSpec } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { type EmbeddingProvider, resolveEmbeddingProvider } from '@seta/shared-embeddings';
import { resolveReranker } from '@seta/shared-retrieval';
import { z } from 'zod';
import { getPlannerVectorStore } from '../../embeddings/vector-store.ts';
import {
  ClassificationSchema,
  DedupInputSchema,
  DedupOutputSchema,
  DupActionSchema,
} from './schemas.ts';
import { buildConfirmNotDuplicateCard } from './steps/confirm-not-duplicate.ts';
import { applyDupDecision, findDupCandidates } from './workflow.ts';

// Thresholds are distances (1 - cosine_score). Reranker scores in this
// deployment sit in the 0.55–0.70 range for near-duplicates, so the
// distance thresholds must be calibrated accordingly:
//   likelyDup  < 0.35  →  score > 0.65  (strong duplicate signal)
//   maybeDup   < 0.45  →  score > 0.55  (moderate duplicate signal)
const DEFAULT_THRESHOLDS = { likelyDup: 0.35, maybeDup: 0.45 };

function getProvider(): EmbeddingProvider {
  return resolveEmbeddingProvider();
}

function getPgVector(): PgVector {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL required for dedupOnCreate workflow');
  return getPlannerVectorStore(databaseUrl);
}

const SearchOutputSchema = z.object({
  classification: ClassificationSchema,
  candidates: z.array(z.unknown()),
  task: DedupInputSchema,
});

const searchStep = createStep({
  id: 'dedupOnCreate.search',
  description:
    'Searches for near-duplicate tasks using vector similarity against the already-created task.',
  inputSchema: DedupInputSchema,
  outputSchema: SearchOutputSchema,
  execute: async ({ inputData, requestContext }) => {
    const session = await sessionFromRequestContext(requestContext);
    const result = await findDupCandidates(
      {
        task: inputData,
        session: { tenantId: session.tenantId, userId: session.userId },
      },
      {
        provider: getProvider(),
        pgVector: getPgVector(),
        reranker: resolveReranker(),
        thresholds: DEFAULT_THRESHOLDS,
      },
    );
    return {
      classification: result.classification,
      candidates: result.candidates,
      task: result.task,
    };
  },
});

const decideStep = createStep({
  id: 'dedupOnCreate.decide',
  description:
    'Shows duplicate candidates to the user for review; suspends until user picks Link / Delete / Leave.',
  inputSchema: SearchOutputSchema,
  outputSchema: DedupOutputSchema,
  suspendSchema: ApprovalCardSchema,
  resumeSchema: DupActionSchema,
  execute: async ({ inputData, resumeData, suspend, requestContext, runId }) => {
    const { userId } = await sessionFromRequestContext(requestContext);
    const fullSession = await buildActorSession({ user_id: userId });

    if (resumeData) {
      return applyDupDecision({
        taskId: inputData.task.taskId,
        action: resumeData,
        session: fullSession,
      });
    }

    // No-match: no duplicate found — task stays as-is, no HITL needed.
    if (inputData.classification === 'no-match') {
      return { kind: 'kept' as const, taskId: inputData.task.taskId };
    }

    const card = buildConfirmNotDuplicateCard({
      classification: inputData.classification,
      // biome-ignore lint/suspicious/noExplicitAny: candidates passed through opaquely between steps
      candidates: inputData.candidates as any,
      task: inputData.task,
      session: { tenantId: fullSession.tenant_id, userId },
      toolCallId: `workflow:${runId}`,
    });
    return suspend(card);
  },
});

export const dedupOnCreateWorkflow = createWorkflow({
  id: 'planner.dedupOnCreate',
  inputSchema: DedupInputSchema,
  outputSchema: DedupOutputSchema,
})
  .then(searchStep)
  .then(decideStep)
  .commit();

export const dedupOnCreateWorkflowSpec: WorkflowSpec = {
  domain: 'work',
  id: 'dedupOnCreate',
  description:
    'Checks for duplicate tasks after creation; HITL approval picks ' +
    'Link (mark as related) / Delete this ticket / Leave it.',
  inputSchema: DedupInputSchema,
  outputSchema: DedupOutputSchema,
  workflow: dedupOnCreateWorkflow,
  hitlSteps: ['dedupOnCreate.decide'],
};
