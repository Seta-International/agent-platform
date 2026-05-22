import { createTool } from '@mastra/core/tools';
import { matchUsersToTopic } from '@seta/identity';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import type { Pool } from 'pg';
import { z } from 'zod';
import { buildActorSession } from '../session.ts';
import { actorFromContext, RequestContextSchema, registerToolPermission } from './_types.ts';

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
      source: z.literal('vector'),
    }),
  ),
});

export interface MatchUsersToTopicToolDeps {
  provider: EmbeddingProvider;
  pool: Pool;
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

        const hits = await matchUsersToTopic(
          {
            topic: input.topic,
            tenant_id: session.tenant_id,
            limit: input.limit ?? 10,
            minScore: input.min_score,
          },
          { provider: deps.provider, pool: deps.pool },
        );

        return {
          candidates: hits.map((h) => ({
            user: h.item,
            match_score: h.score,
            source: 'vector' as const,
          })),
        };
      },
    }),
    'identity.user.read',
  );
}
