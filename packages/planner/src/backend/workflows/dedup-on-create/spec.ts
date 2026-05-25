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
import { getPlannerVectorStore } from '../../embeddings/vector-store.ts';
import {
  ClassificationSchema,
  DedupOutputSchema,
  LinkModeSchema,
  TaskDraftSchema,
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

const DupActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('create-new') }),
  z.object({ kind: z.literal('link'), existingId: z.string().uuid(), mode: LinkModeSchema }),
  z.object({ kind: z.literal('cancel') }),
]);

const SearchOutputSchema = z.object({
  classification: ClassificationSchema,
  candidates: z.array(z.unknown()),
  draft: TaskDraftSchema,
});

const searchStep = createStep({
  id: 'dedupOnCreate.search',
  inputSchema: TaskDraftSchema,
  outputSchema: SearchOutputSchema,
  execute: async ({ inputData, requestContext }) => {
    const session = await sessionFromRequestContext(requestContext);
    const result = await findDupCandidates(
      {
        draft: inputData,
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
      draft: result.draft,
    };
  },
});

const decideStep = createStep({
  id: 'dedupOnCreate.decide',
  inputSchema: SearchOutputSchema,
  outputSchema: DedupOutputSchema,
  suspendSchema: ApprovalCardSchema,
  resumeSchema: DupActionSchema,
  execute: async ({ inputData, resumeData, suspend, requestContext, runId }) => {
    const { userId } = await sessionFromRequestContext(requestContext);
    const fullSession = await buildActorSession({ user_id: userId });

    if (resumeData) {
      return applyDupDecision({
        draft: inputData.draft,
        action: resumeData,
        session: fullSession,
      });
    }

    // No-match: no duplicate, no HITL needed — create directly.
    if (inputData.classification === 'no-match') {
      return applyDupDecision({
        draft: inputData.draft,
        action: { kind: 'create-new' },
        session: fullSession,
      });
    }

    const card = buildConfirmNotDuplicateCard({
      classification: inputData.classification,
      // biome-ignore lint/suspicious/noExplicitAny: candidates passed through opaquely between steps
      candidates: inputData.candidates as any,
      draft: inputData.draft,
      session: { tenantId: fullSession.tenant_id, userId },
      toolCallId: `workflow:${runId}`,
    });
    return suspend(card);
  },
});

export const dedupOnCreateWorkflow = createWorkflow({
  id: 'planner.dedupOnCreate',
  inputSchema: TaskDraftSchema,
  outputSchema: DedupOutputSchema,
})
  .then(searchStep)
  .then(decideStep)
  .commit();

export const dedupOnCreateWorkflowSpec: WorkflowSpec = {
  domain: 'work',
  id: 'dedupOnCreate',
  description:
    'Vector-search similar tasks before creating; HITL approval picks ' +
    'create-new / link-as-related / link-as-sub-task / cancel.',
  inputSchema: TaskDraftSchema,
  outputSchema: DedupOutputSchema,
  workflow: dedupOnCreateWorkflow,
  hitlSteps: ['dedupOnCreate.decide'],
};
