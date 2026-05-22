import { createTool } from '@mastra/core/tools';
import { matchUsersToTopic } from '@seta/identity';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import type { Reranker } from '@seta/shared-retrieval';
import type { Pool } from 'pg';
import { z } from 'zod';
import { buildActorSession } from '../session.ts';
import { actorFromContext, RequestContextSchema, registerToolPermission } from './_types.ts';

const STAGE1_TOPK = Number(process.env.RERANK_STAGE1_TOPK ?? 50);

const inputSchema = z.object({
  topic: z
    .string()
    .min(1)
    .max(500)
    .describe('Natural language description of the skill area or topic to match against'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe('Maximum number of candidates to return'),
  min_score: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Minimum match score threshold (0–1). Lower scores are excluded.'),
});

const outputSchema = z.object({
  candidates: z.array(
    z.object({
      user: z.object({
        user_id: z.string(),
        display_name: z.string(),
        email: z.string(),
        skills: z.array(z.string()),
      }),
      match_score: z.number(),
      rerank_score: z.number(),
      source: z.literal('vector'),
    }),
  ),
  /** Which reranker actually ran — surfaces precision tier to the agent. */
  reranker: z.enum(['cohere', 'llm-judge', 'noop', 'fallback']),
});

export interface MatchUsersToTopicToolDeps {
  provider: EmbeddingProvider;
  pool: Pool;
  reranker: Reranker;
  /**
   * Optional override for deriving a session from an actor.
   * Defaults to buildActorSession. Injected in tests to avoid
   * hitting the live identity / RBAC stores.
   */
  sessionProvider?: (actor: { user_id: string }) => Promise<{
    tenant_id: string;
    accessible_group_ids: ReadonlyArray<string>;
  }>;
}

export function matchUsersToTopicTool(deps: MatchUsersToTopicToolDeps) {
  const resolveSession = deps.sessionProvider ?? buildActorSession;

  return registerToolPermission(
    createTool({
      id: 'match_users_to_topic',
      description:
        'Find users whose declared skills best match a given topic or skill area. Returns ranked candidates with user details and match scores.',
      inputSchema,
      outputSchema,
      requestContextSchema: RequestContextSchema,
      execute: async (input, ctx) => {
        const actor = actorFromContext(ctx);
        const session = await resolveSession(actor);

        const requestedLimit = input.limit ?? 10;

        // Stage 1: oversampled vector retrieval.
        const stage1Limit = Math.max(requestedLimit * 3, STAGE1_TOPK);
        const stage1 = await matchUsersToTopic(
          {
            topic: input.topic,
            tenant_id: session.tenant_id,
            limit: stage1Limit,
            minScore: input.min_score,
          },
          { provider: deps.provider, pool: deps.pool },
        );

        // Stage 2: rerank stage-1 hits and truncate to the requested limit.
        const reranked = await deps.reranker.rescore(input.topic, stage1, {
          topN: requestedLimit,
        });

        const usedReranker = reranked[0]?.reranker ?? 'noop';

        return {
          candidates: reranked.map((h) => ({
            user: h.item,
            match_score: h.score,
            rerank_score: h.rerankScore,
            source: 'vector' as const,
          })),
          reranker: usedReranker,
        };
      },
    }),
    'identity.user.read',
  );
}
