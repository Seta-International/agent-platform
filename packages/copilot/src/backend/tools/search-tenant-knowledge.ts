import { createTool } from '@mastra/core/tools';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import type { Reranker } from '@seta/shared-retrieval';
import type { Pool } from 'pg';
import { z } from 'zod';
import { searchTenantKnowledge } from '../knowledge/retrieval/search-tenant-knowledge.ts';
import { buildActorSession } from '../session.ts';
import { actorFromContext, RequestContextSchema, registerToolPermission } from './_types.ts';

const STAGE1_TOPK = Number(process.env.RERANK_STAGE1_TOPK ?? 50);

const inputSchema = z.object({
  query: z.string().min(1).max(500).describe('Natural language search query'),
  limit: z.number().int().min(1).max(20).default(5).describe('Maximum number of results to return'),
});

const outputSchema = z.object({
  hits: z.array(
    z.object({
      file_id: z.string(),
      filename: z.string(),
      page_hint: z.string().nullable(),
      chunk_text: z.string(),
      score: z.number(),
      rerank_score: z.number(),
    }),
  ),
  /** Which reranker actually ran — surfaces precision tier to the agent. */
  reranker: z.enum(['cohere', 'llm-judge', 'noop', 'fallback']),
});

export interface SearchTenantKnowledgeToolDeps {
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

export function searchTenantKnowledgeTool(deps: SearchTenantKnowledgeToolDeps) {
  const resolveSession = deps.sessionProvider ?? buildActorSession;

  return registerToolPermission(
    createTool({
      id: 'search_tenant_knowledge',
      description:
        'Search uploaded company documents (handbooks, policies, processes) by semantic similarity. Returns chunk text with filename and page hint for citation.',
      inputSchema,
      outputSchema,
      requestContextSchema: RequestContextSchema,
      execute: async (input, ctx) => {
        const actor = actorFromContext(ctx);
        const session = await resolveSession(actor);

        const requestedLimit = input.limit ?? 10;

        // Stage 1: oversampled vector retrieval.
        const stage1Limit = Math.max(requestedLimit * 3, STAGE1_TOPK);
        const stage1 = await searchTenantKnowledge(
          {
            query: input.query,
            tenant_id: session.tenant_id,
            limit: stage1Limit,
          },
          { provider: deps.provider, pool: deps.pool },
        );

        // Stage 2: rerank stage-1 hits and truncate to the requested limit.
        const reranked = await deps.reranker.rescore(input.query, stage1, {
          topN: requestedLimit,
        });

        const usedReranker = reranked[0]?.reranker ?? 'noop';

        return {
          hits: reranked.map((h) => ({
            file_id: h.item.file_id,
            filename: h.item.filename,
            page_hint: h.item.page_hint,
            chunk_text: h.item.chunk_text,
            score: h.score,
            rerank_score: h.rerankScore,
          })),
          reranker: usedReranker,
        };
      },
    }),
    'copilot.knowledge.read',
  );
}
