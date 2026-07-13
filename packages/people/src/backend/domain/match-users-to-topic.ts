// rbac: system-only — called from agent tools and staffing pipelines; tenant scope enforced by caller.
import type { PgVector } from '@mastra/pg';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { EmbedQueryCache, type RetrievalHit } from '@seta/shared-retrieval';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { person, userProjection } from '../db/schema.ts';
import {
  ensurePeopleVectorIndex,
  PEOPLE_VECTOR_INDEX,
  type PersonProfileVectorMetadata,
} from '../embeddings/vector-store.ts';

export interface UserMatch {
  user_id: string;
  person_id: string;
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

/**
 * Semantic user search over the People person-profile embeddings (people_rag).
 * Vectors are keyed by person_id; display fields (name, email) are NOT
 * denormalized into vector metadata — they are hydrated by a single batched
 * join to People worker(+person) so results are always fresh.
 *
 * Hits whose worker record is missing (stale embedding) or whose person has no
 * linked user account are dropped: downstream consumers assign tasks to a
 * user_id, so a person without one cannot be a candidate.
 */
export async function matchUsersToTopic(
  input: MatchUsersToTopicInput,
  deps: MatchUsersToTopicDeps,
): Promise<RetrievalHit<UserMatch>[]> {
  const cache = deps.embedQueryCache ?? defaultCache;
  const { tenant_id, limit } = input;
  const rawMinScore = input.minScore ?? 0.5;
  const minScore = rawMinScore <= 0 ? -1 : rawMinScore;

  await ensurePeopleVectorIndex(deps.pgVector);

  if (input.topic.trim() === '') return [];

  const queryVector = await cache.get(deps.provider.modelId, input.topic, async () => {
    const [vec] = await deps.provider.embed([input.topic]);
    return vec as number[];
  });

  const rows = await deps.pgVector.query({
    indexName: PEOPLE_VECTOR_INDEX,
    queryVector,
    topK: limit,
    filter: { tenant_id: { $eq: tenant_id } },
  });

  // Ranked person hits above threshold, preserving vector order.
  const ranked: Array<{ person_id: string; score: number; skills: string[] }> = [];
  for (const row of rows) {
    if (row.score < minScore) continue;
    const md = row.metadata as Partial<PersonProfileVectorMetadata> | undefined;
    if (!md?.person_id) continue;
    ranked.push({
      person_id: md.person_id,
      score: row.score,
      skills: md.skills ?? [],
    });
  }
  if (ranked.length === 0) return [];

  // ONE batched worker(+person) join — always-fresh display fields, no metadata staleness.
  const personIds = ranked.map((r) => r.person_id);
  const dispRows = await peopleDb()
    .select({
      person_id: person.id,
      user_id: userProjection.user_id,
      full_name: person.full_name,
      work_email: person.work_email,
    })
    .from(person)
    .innerJoin(userProjection, eq(userProjection.person_id, person.id))
    .where(
      and(
        eq(person.tenant_id, tenant_id),
        inArray(person.id, personIds),
        isNull(person.deleted_at),
      ),
    );

  const byPerson = new Map(dispRows.map((r) => [r.person_id, r]));

  const hits: RetrievalHit<UserMatch>[] = [];
  for (const r of ranked) {
    const disp = byPerson.get(r.person_id);
    if (!disp?.user_id) continue;
    hits.push({
      item: {
        user_id: disp.user_id,
        person_id: r.person_id,
        display_name: disp.full_name ?? '',
        email: disp.work_email ?? '',
        skills: r.skills,
      },
      score: r.score,
      rank: hits.length + 1,
      source: 'vector',
    });
  }
  return hits;
}
