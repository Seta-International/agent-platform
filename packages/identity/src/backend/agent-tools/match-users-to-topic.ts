import type { PgVector } from '@mastra/pg';
import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import type { Reranker } from '@seta/shared-retrieval';
import { z } from 'zod';
import { buildActorSession } from '../domain/build-actor-session.ts';
import { matchUsersToTopic } from '../domain/match-users-to-topic.ts';
import { getIdentityVectorStore } from '../embeddings/vector-store.ts';

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
  reranker: z.enum(['cohere', 'llm-judge', 'noop', 'fallback']),
});

export interface MatchUsersToTopicToolDeps {
  provider: EmbeddingProvider;
  reranker: Reranker;
  databaseUrl?: string;
  pgVector?: PgVector;
  sessionProvider?: (actor: { user_id: string }) => Promise<{
    tenant_id: string;
    accessible_group_ids: ReadonlyArray<string>;
  }>;
}

export function matchUsersToTopicTool(deps: MatchUsersToTopicToolDeps) {
  const resolveSession = deps.sessionProvider ?? buildActorSession;

  return defineAgentTool({
    id: 'identity_matchUsersByTopic',
    name: 'Match Users By Topic',
    description:
      'Find users whose skills best match a topic or skill area using semantic similarity.\n\n' +
      'Use for: "who knows about Kubernetes?"; "find people with ML expertise"; broad topic queries ' +
      'where you do not have an exact skill tag list.\n' +
      'Do NOT use for exact skill-tag matching within a group — use ' +
      'planner_searchGroupMembersBySkills for that.\n\n' +
      'Returns ranked candidates with match and rerank scores. Tenant-scoped.',
    input: inputSchema,
    output: outputSchema,
    rbac: 'identity.user.read',
    execute: async (input, ctx) => {
      const actor = actorFromContext(ctx);
      const session = await resolveSession(actor);

      const pgVector =
        deps.pgVector ??
        (deps.databaseUrl
          ? getIdentityVectorStore(deps.databaseUrl)
          : (() => {
              throw new Error(
                'identity_matchUsersByTopic: either pgVector or databaseUrl must be supplied',
              );
            })());

      const requestedLimit = input.limit ?? 10;
      const stage1Limit = Math.max(requestedLimit * 3, STAGE1_TOPK);

      const stage1 = await matchUsersToTopic(
        {
          topic: input.topic,
          tenant_id: session.tenant_id,
          limit: stage1Limit,
          minScore: input.min_score,
        },
        { provider: deps.provider, pgVector },
      );

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
  });
}
