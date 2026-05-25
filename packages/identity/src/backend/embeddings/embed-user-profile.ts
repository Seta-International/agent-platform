import type { PgVector } from '@mastra/pg';
import { type EmbeddingProvider, embedMany, sourceHash } from '@seta/shared-embeddings';
import { getUserProfileForEmbedding } from '../domain/get-user-profile-for-embedding.ts';
import { buildUserProfileSource } from './source.ts';
import {
  ensureIdentityVectorIndex,
  IDENTITY_VECTOR_INDEX,
  type UserProfileVectorMetadata,
  userProfileVectorId,
} from './vector-store.ts';

export interface EmbedUserProfilePayload {
  tenant_id: string;
  user_id: string;
  event_id: string;
}

export interface EmbedUserProfileDeps {
  provider: EmbeddingProvider;
  pgVector: PgVector;
}

export async function embedUserProfile(
  payload: EmbedUserProfilePayload,
  deps: EmbedUserProfileDeps,
): Promise<void> {
  const { tenant_id, user_id } = payload;
  const { provider, pgVector } = deps;

  await ensureIdentityVectorIndex(pgVector);

  const profile = await getUserProfileForEmbedding({ tenant_id, user_id });

  if (profile == null) {
    await pgVector
      .deleteVector({
        indexName: IDENTITY_VECTOR_INDEX,
        id: userProfileVectorId(tenant_id, user_id),
      })
      .catch(() => {});
    return;
  }

  const source = buildUserProfileSource(profile);
  if (source === '') {
    await pgVector
      .deleteVector({
        indexName: IDENTITY_VECTOR_INDEX,
        id: userProfileVectorId(tenant_id, user_id),
      })
      .catch(() => {});
    return;
  }

  const hash = sourceHash(source);

  const existing = await pgVector.query({
    indexName: IDENTITY_VECTOR_INDEX,
    filter: { tenant_id: { $eq: tenant_id }, user_id: { $eq: user_id } },
    topK: 1,
  });
  if (existing[0]?.metadata?.source_hash === hash) return;

  const [vector] = await embedMany(provider, [source]);
  if (!vector) throw new Error('embedMany returned no vector for user profile source');

  const metadata: UserProfileVectorMetadata = {
    tenant_id,
    user_id,
    display_name: profile.name,
    email: profile.email,
    skills: profile.skills,
    source_hash: hash,
    model_id: provider.modelId,
    embedded_at: new Date().toISOString(),
  };

  await pgVector.upsert({
    indexName: IDENTITY_VECTOR_INDEX,
    vectors: [vector],
    metadata: [metadata],
    ids: [userProfileVectorId(tenant_id, user_id)],
  });
}
