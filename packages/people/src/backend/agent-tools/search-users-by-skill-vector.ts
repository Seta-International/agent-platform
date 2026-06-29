import type { PgVector } from '@mastra/pg';
import type { CrossModuleReadToolSpec } from '@seta/agent-sdk';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { z } from 'zod';
import { matchUsersToTopic } from '../domain/match-users-to-topic.ts';
import { getPeopleVectorStore } from '../embeddings/vector-store.ts';

const inputSchema = z.object({
  queryText: z
    .string()
    .min(1)
    .max(2000)
    .describe('Natural-language query: usually task labels + description'),
  topK: z.number().int().min(1).max(50).default(20),
  minScore: z.number().min(0).max(1).optional(),
});

const outputSchema = z.object({
  hits: z.array(
    z.object({
      userId: z.string(),
      score: z.number(),
    }),
  ),
});

export type SearchUsersBySkillVectorInput = z.infer<typeof inputSchema>;
export type SearchUsersBySkillVectorOutput = z.infer<typeof outputSchema>;

export interface SearchUsersBySkillVectorDeps {
  provider: EmbeddingProvider;
  databaseUrl?: string;
  pgVector?: PgVector;
}

/**
 * Cross-module read tool: vector-search active users whose embedded profile
 * (skills + bio) best matches a free-text query.
 *
 * Consumed by planner.assignBySkill (vector branch). Availability (ooo/busy)
 * is enforced downstream; vector metadata is not the source of truth for
 * state changes.
 */
export function buildSearchUsersBySkillVectorSpec(
  deps: SearchUsersBySkillVectorDeps,
): CrossModuleReadToolSpec<SearchUsersBySkillVectorInput, SearchUsersBySkillVectorOutput> {
  const resolvePgVector = (): PgVector => {
    if (deps.pgVector) return deps.pgVector;
    if (!deps.databaseUrl) {
      throw new Error('people_searchUsersBySkillVector: pgVector or databaseUrl required');
    }
    return getPeopleVectorStore(deps.databaseUrl);
  };

  return {
    id: 'people_searchUsersBySkillVector',
    description:
      'Vector-search users by skill profile — workflow use only (not LLM-visible). ' +
      'Returns userId + raw similarity score without reranking. ' +
      'For LLM-visible semantic user search, use people_matchUsersByTopic instead.',
    inputSchema,
    outputSchema,
    rbac: 'people.worker.read',
    availableTo: 'all-specialists',
    execute: async ({ session, input }) => {
      const parsed = inputSchema.parse(input);
      const hits = await matchUsersToTopic(
        {
          topic: parsed.queryText,
          tenant_id: session.tenant_id,
          limit: parsed.topK,
          minScore: parsed.minScore,
        },
        { provider: deps.provider, pgVector: resolvePgVector() },
      );
      return {
        hits: hits.map((h) => ({ userId: h.item.user_id, score: h.score })),
      };
    },
  };
}
