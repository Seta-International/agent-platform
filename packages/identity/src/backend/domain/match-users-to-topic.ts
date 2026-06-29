// rbac: system-only — called from agent tools and staffing pipelines; tenant scope enforced by caller.
import type { PgVector } from '@mastra/pg';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { EmbedQueryCache, type RetrievalHit } from '@seta/shared-retrieval';

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
  /** Defaults to 'person_profile_embeddings' (people pipeline). */
  indexName?: string;
  ensureIndex?: (pgVector: PgVector) => Promise<void>;
  embedQueryCache?: EmbedQueryCache;
}

const defaultCache = new EmbedQueryCache({ maxEntries: 100, ttlMs: 5 * 60_000 });

export async function matchUsersToTopic(
  input: MatchUsersToTopicInput,
  deps: MatchUsersToTopicDeps,
): Promise<RetrievalHit<UserMatch>[]> {
  const cache = deps.embedQueryCache ?? defaultCache;
  const indexName = deps.indexName ?? 'person_profile_embeddings';
  const { tenant_id, limit } = input;
  const rawMinScore = input.minScore ?? 0.5;
  const minScore = rawMinScore <= 0 ? -1 : rawMinScore;

  if (deps.ensureIndex) {
    await deps.ensureIndex(deps.pgVector);
  }

  const queryVector = await cache.get(deps.provider.modelId, input.topic, async () => {
    const [vec] = await deps.provider.embed([input.topic]);
    return vec as number[];
  });

  const rows = await deps.pgVector.query({
    indexName,
    queryVector,
    topK: limit,
    filter: { tenant_id: { $eq: tenant_id } },
  });

  const hits: RetrievalHit<UserMatch>[] = [];
  for (const row of rows) {
    if (row.score < minScore) continue;
    const md = row.metadata as Partial<Record<string, unknown>> | undefined;
    // Support both legacy user_id (identity) and person_id (people) metadata shapes
    const userId = (md?.user_id as string | undefined) ?? (md?.person_id as string | undefined);
    if (!userId) continue;
    hits.push({
      item: {
        user_id: userId,
        display_name: (md?.display_name as string | undefined) ?? '',
        email: (md?.email as string | undefined) ?? '',
        skills: (md?.skills as string[] | undefined) ?? [],
      },
      score: row.score,
      rank: hits.length + 1,
      source: 'vector',
    });
  }
  return hits;
}
