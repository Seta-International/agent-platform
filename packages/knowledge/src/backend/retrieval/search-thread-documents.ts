import { getPool } from '@seta/shared-db';
import { resolveEmbeddingProvider } from '@seta/shared-embeddings';
import { resolveReranker } from '@seta/shared-retrieval';
import { getKnowledgeVectorStore } from '../embeddings/vector-store.ts';
import { searchThreadKnowledge } from './search-thread-knowledge.ts';

const STAGE1_TOPK = Number(process.env.RERANK_STAGE1_TOPK ?? 50);

export interface ThreadDocumentHit {
  file_id: string;
  filename: string;
  page_hint: string | null;
  chunk_text: string;
  score: number;
  rerank_score: number;
}

export interface SearchThreadDocumentsInput {
  tenant_id: string;
  thread_id: string;
  query: string;
  limit?: number;
}

/** End-to-end thread document search: embeds the query, retrieves thread-scoped
 *  chunks, and reranks them. Resolves provider/pool/pgVector/reranker from the
 *  process env so callers (the orchestrator) need no RAG plumbing. */
export async function searchThreadDocuments(
  input: SearchThreadDocumentsInput,
): Promise<ThreadDocumentHit[]> {
  const provider = resolveEmbeddingProvider();
  const pool = getPool('worker');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL required for thread document search');
  const pgVector = getKnowledgeVectorStore(databaseUrl);
  const reranker = resolveReranker();

  const requestedLimit = input.limit ?? 5;
  const stage1Limit = Math.max(requestedLimit * 3, STAGE1_TOPK);

  const stage1 = await searchThreadKnowledge(
    {
      query: input.query,
      tenant_id: input.tenant_id,
      thread_id: input.thread_id,
      limit: stage1Limit,
    },
    { provider, pgVector, pool },
  );

  const reranked = await reranker.rescore(input.query, stage1, { topN: requestedLimit });

  return reranked.map((h) => ({
    file_id: h.item.file_id,
    filename: h.item.filename,
    page_hint: h.item.page_hint,
    chunk_text: h.item.chunk_text,
    score: h.score,
    rerank_score: h.rerankScore,
  }));
}
