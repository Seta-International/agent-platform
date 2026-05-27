// rbac: system-only — called from agent tools and staffing pipelines; tenant scope enforced by caller.
import type { PgVector } from '@mastra/pg';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { EmbedQueryCache, type RetrievalHit } from '@seta/shared-retrieval';
import {
  ensureIdentityVectorIndex,
  IDENTITY_VECTOR_INDEX,
  type UserProfileVectorMetadata,
} from '../embeddings/vector-store.ts';

export interface UserMatch {
  user_id: string;
  display_name: string;
  email: string;
  skills: string[];
}

export interface MatchUsersToTopicInput {
  topic: string;
  tenant_id: string;
  limit: number;
  minScore?: number;
}

export interface MatchUsersToTopicDeps {
  provider: EmbeddingProvider;
  pgVector: PgVector;
  embedQueryCache?: EmbedQueryCache;
}

const defaultCache = new EmbedQueryCache({ maxEntries: 100, ttlMs: 5 * 60_000 });

export async function matchUsersToTopic(
  input: MatchUsersToTopicInput,
  deps: MatchUsersToTopicDeps,
): Promise<RetrievalHit<UserMatch>[]> {
  const cache = deps.embedQueryCache ?? defaultCache;
  const { tenant_id, limit } = input;
  const rawMinScore = input.minScore ?? 0.5;
  const minScore = rawMinScore <= 0 ? -1 : rawMinScore;

  await ensureIdentityVectorIndex(deps.pgVector);

  const queryVector = await cache.get(deps.provider.modelId, input.topic, async () => {
    const [vec] = await deps.provider.embed([input.topic]);
    return vec as number[];
  });

  const rows = await deps.pgVector.query({
    indexName: IDENTITY_VECTOR_INDEX,
    queryVector,
    topK: limit,
    filter: { tenant_id: { $eq: tenant_id } },
  });

  const hits: RetrievalHit<UserMatch>[] = [];
  for (const row of rows) {
    if (row.score < minScore) continue;
    const md = row.metadata as Partial<UserProfileVectorMetadata> | undefined;
    if (!md?.user_id) continue;
    hits.push({
      item: {
        user_id: md.user_id,
        display_name: md.display_name ?? '',
        email: md.email ?? '',
        skills: md.skills ?? [],
      },
      score: row.score,
      rank: hits.length + 1,
      source: 'vector',
    });
  }
  return hits;
}
