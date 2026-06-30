import type { PgVector } from '@mastra/pg';
import { type EmbeddingProvider, embedMany, sourceHash } from '@seta/shared-embeddings';
import { getPersonProfileForEmbedding } from '../domain/get-person-profile-for-embedding.ts';
import { buildPersonProfileSource } from './source.ts';
import {
  ensurePeopleVectorIndex,
  PEOPLE_VECTOR_INDEX,
  type PersonProfileVectorMetadata,
  personProfileVectorId,
} from './vector-store.ts';

export interface EmbedPersonProfilePayload {
  tenant_id: string;
  person_id: string;
  event_id: string;
}

export interface EmbedPersonProfileDeps {
  provider: EmbeddingProvider;
  pgVector: PgVector;
}

export async function embedPersonProfile(
  payload: EmbedPersonProfilePayload,
  deps: EmbedPersonProfileDeps,
): Promise<void> {
  const { tenant_id, person_id } = payload;
  const { provider, pgVector } = deps;

  await ensurePeopleVectorIndex(pgVector);

  const profile = await getPersonProfileForEmbedding({ tenant_id, person_id });

  if (profile == null) {
    await pgVector
      .deleteVector({
        indexName: PEOPLE_VECTOR_INDEX,
        id: personProfileVectorId(tenant_id, person_id),
      })
      .catch(() => {});
    return;
  }

  const source = buildPersonProfileSource(profile);
  if (source === '') {
    await pgVector
      .deleteVector({
        indexName: PEOPLE_VECTOR_INDEX,
        id: personProfileVectorId(tenant_id, person_id),
      })
      .catch(() => {});
    return;
  }

  const hash = sourceHash(source);

  const existing = await pgVector.query({
    indexName: PEOPLE_VECTOR_INDEX,
    filter: { tenant_id: { $eq: tenant_id }, person_id: { $eq: person_id } },
    topK: 1,
  });
  if (existing[0]?.metadata?.source_hash === hash) return;

  const [vector] = await embedMany(provider, [source]);
  if (!vector) throw new Error('embedMany returned no vector for person profile source');

  const metadata: PersonProfileVectorMetadata = {
    tenant_id,
    person_id,
    skills: profile.skills,
    source_hash: hash,
    model_id: provider.modelId,
    embedded_at: new Date().toISOString(),
  };

  await pgVector.upsert({
    indexName: PEOPLE_VECTOR_INDEX,
    vectors: [vector],
    metadata: [metadata],
    ids: [personProfileVectorId(tenant_id, person_id)],
  });
}
