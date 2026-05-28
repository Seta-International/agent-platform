import { createStep } from '@mastra/core/workflows';
// Use the evented engine so workflow.start / .suspend / .end land on the
// `workflows` pubsub topic that agent's lifecycle hook projects.
import { createWorkflow } from '@mastra/core/workflows/evented';
import type { PgVector } from '@mastra/pg';
import { ApprovalCardSchema, sessionFromRequestContext, type WorkflowSpec } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { type EmbeddingProvider, OpenAIEmbeddingProvider } from '@seta/shared-embeddings';
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

const DEFAULT_THRESHOLDS = { likelyDup: 0.18, maybeDup: 0.3 };

let lazyProvider: EmbeddingProvider | undefined;
function getProvider(): EmbeddingProvider {
  if (lazyProvider) return lazyProvider;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY required for dedupOnCreate workflow');
  const model = (process.env.EMBED_MODEL ?? 'text-embedding-3-small') as
    | 'text-embedding-3-small'
    | 'text-embedding-3-large';
  lazyProvider = new OpenAIEmbeddingProvider({ apiKey, model });
  return lazyProvider;
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
