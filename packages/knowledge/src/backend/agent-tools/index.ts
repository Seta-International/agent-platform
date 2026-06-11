import { type AgentTool, actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { getPool } from '@seta/shared-db';
import { resolveEmbeddingProvider } from '@seta/shared-embeddings';
import { resolveReranker } from '@seta/shared-retrieval';
import { z } from 'zod';
import { getKnowledgeVectorStore } from '../embeddings/vector-store.ts';
import { searchTenantKnowledge } from '../retrieval/search-tenant-knowledge.ts';

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
  reranker: z.enum(['cohere', 'llm-judge', 'noop', 'fallback']),
});

export const searchTenantKnowledgeAgentTool = defineAgentTool({
  id: 'knowledge_searchDocuments',
  name: 'Search Documents',
  description:
    'Search uploaded company documents (handbooks, policies, processes) by semantic similarity.\n\n' +
    'Use for: "what does our leave policy say?"; "find the onboarding handbook section about X"; ' +
    '"does our security policy cover Y?".\n' +
    'Do NOT use to find tasks or people — use planner_findSimilarTasks or identity_matchUsersByTopic instead.\n\n' +
    'Returns chunk text with filename and page hint for citation.',
  input: inputSchema,
  output: outputSchema,
  rbac: 'knowledge.search.read',
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession(actor);
    const provider = resolveEmbeddingProvider();
    const pool = getPool('worker');
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL required for knowledge search');
    const pgVector = getKnowledgeVectorStore(databaseUrl);
    const reranker = resolveReranker();
    const requestedLimit = input.limit ?? 5;
    const stage1Limit = Math.max(requestedLimit * 3, STAGE1_TOPK);

    const stage1 = await searchTenantKnowledge(
      { query: input.query, tenant_id: session.tenant_id, limit: stage1Limit },
      { provider, pgVector, pool },
    );

    const reranked = await reranker.rescore(input.query, stage1, { topN: requestedLimit });
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
});

export const knowledgeAgentTools: AgentTool[] = [searchTenantKnowledgeAgentTool];
