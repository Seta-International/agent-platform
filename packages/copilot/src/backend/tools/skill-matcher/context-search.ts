import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { actorFromContext, RequestContextSchema, registerToolPermission } from '../_types.ts';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

/**
 * One result row from the vector search.
 * text comes from user_profile.skills joined as a readable string.
 * Joined with identity.user and identity.user_profile for the raw text chunk.
 */
export type ChunkResult = {
  user_id: string; // identity.user_skill_embeddings.user_id
  text: string; // readable skills text built from user_profile.skills[]
  similarity: number; // cosine similarity score 0–1
};

// ──────────────────────────────────────────────────────────────────────────────
// Dependency contract
//
// Caller injects two functions:
//   embed       — calls OpenAI text-embedding-3-small, returns number[]
//   searchByEmbedding — runs cosine similarity query against
//                       identity.user_skill_embeddings, joins user_profile,
//                       returns ChunkResult[] filtered by threshold
// ──────────────────────────────────────────────────────────────────────────────

export type ContextSearchDeps = {
  embed: (text: string) => Promise<number[]>;
  searchByEmbedding: (params: {
    vector: number[];
    tenantId: string;
    threshold: number;
    topK: number;
  }) => Promise<ChunkResult[]>;
};

// ──────────────────────────────────────────────────────────────────────────────
// Tool 2 of the SkillMatcher pipeline.
//
// Embeds the formatted query from skillMatcher_formatQuery, then performs
// cosine similarity search against identity.user_skill_embeddings (pgvector).
// Returns chunks whose similarity score >= threshold (default 0.3).
// ──────────────────────────────────────────────────────────────────────────────

export function makeSkillMatcherContextSearchTool(deps: ContextSearchDeps) {
  return registerToolPermission(
    createTool({
      id: 'skillMatcher_contextSearch',
      description: `
Second tool in the SkillMatcher pipeline.

Embeds the query string (from skillMatcher_formatQuery) using
text-embedding-3-small and runs cosine similarity search against
identity.user_skill_embeddings in the vector database.

Returns text chunks for users whose skill embeddings are similar to the query,
filtered by the similarity threshold (default 0.3).

Pass the output chunks to skillMatcher_llmParser.
      `.trim(),

      inputSchema: z.object({
        task_id: z.string().uuid().describe('Passed through for correlation.'),
        query: z.string().min(1).describe('Formatted query string from skillMatcher_formatQuery.'),
        threshold: z
          .number()
          .min(0)
          .max(1)
          .default(0.3)
          .describe(
            'Minimum cosine similarity score to include a result. ' +
              'Default 0.3 — lower values return more results with weaker matches.',
          ),
        top_k: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe('Maximum number of results to return from the vector search.'),
      }),

      // Mirrors ChunkResult — no invented fields.
      outputSchema: z.object({
        task_id: z.string(),
        chunks: z.array(
          z.object({
            user_id: z.string(),
            text: z.string(),
            similarity: z.number(),
          }),
        ),
        total_found: z.number().int(),
      }),

      requestContextSchema: RequestContextSchema,

      execute: async (input, ctx) => {
        const actor = actorFromContext(ctx);

        // Step 1: embed the formatted query.
        const vector = await deps.embed(input.query);

        // Step 2: cosine similarity search on identity.user_skill_embeddings.
        // The injected function handles the pgvector query and tenant isolation.
        const chunks = await deps.searchByEmbedding({
          vector,
          tenantId: actor.user_id, // caller resolves actual tenant_id from user_id
          threshold: input.threshold ?? 0.3,
          topK: input.top_k ?? 10,
        });

        return {
          task_id: input.task_id,
          chunks,
          total_found: chunks.length,
        };
      },
    }),
    'identity.user.read.any',
  );
}
