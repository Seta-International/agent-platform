import type { PgVector } from '@mastra/pg';
import { sourceHash } from '@seta/shared-embeddings';
import type { Pool } from 'pg';
import { listUsersForBackfill } from '../../domain/list-users-for-embedding-backfill.ts';
import { buildUserProfileSource } from '../source.ts';
import {
  ensureIdentityVectorIndex,
  IDENTITY_VECTOR_INDEX,
  type UserProfileVectorMetadata,
  userProfileVectorId,
} from '../vector-store.ts';
import {
  type BatchInputRow,
  type BatchResultRow,
  pollUntilDone as defaultPoll,
  submitBatch as defaultSubmit,
  type OpenAIBatchClient,
  type SubmitOptions,
} from './openai-batch.ts';

export type { BatchInputRow, BatchResultRow };

const PAGE_SIZE = 1000;

export interface BackfillUserProfilesOptions {
  tenant_id: string;
  pool: Pool;
  pgVector: PgVector;
  apiKey: string;
  model: 'text-embedding-3-small' | 'text-embedding-3-large';
  submitBatch?: typeof defaultSubmit;
  pollUntilDone?: typeof defaultPoll;
}

export async function backfillUserProfiles(opts: BackfillUserProfilesOptions): Promise<void> {
  const {
    tenant_id,
    pool,
    pgVector,
    apiKey,
    model,
    submitBatch: submit = defaultSubmit,
    pollUntilDone: poll = defaultPoll,
  } = opts;

  const modelId = `openai:${model}`;
  const embeddedAt = new Date().toISOString();

  await ensureIdentityVectorIndex(pgVector);

  let cursor = '00000000-0000-0000-0000-000000000000';
  const submitOpts: SubmitOptions = { apiKey, model };
  const pollOpts: OpenAIBatchClient = { apiKey };

  while (true) {
    const page = await listUsersForBackfill({ tenant_id, cursor, limit: PAGE_SIZE, pool });

    if (page.length === 0) break;

    // biome-ignore lint/style/noNonNullAssertion: page.length > 0 checked above
    cursor = page[page.length - 1]!.user_id;

    const sourced = page.map((row) => {
      const source = buildUserProfileSource({
        name: row.name,
        role: row.role,
        skills: row.skills,
      });
      return {
        user_id: row.user_id,
        display_name: row.name,
        email: row.email,
        skills: row.skills,
        source,
        hash: sourceHash(source),
      };
    });

    const pageIds = sourced.map((s) => s.user_id);
    const existing = pageIds.length
      ? await pgVector.query({
          indexName: IDENTITY_VECTOR_INDEX,
          filter: { tenant_id: { $eq: tenant_id }, user_id: { $in: pageIds } },
          topK: pageIds.length,
        })
      : [];
    const existingByUser = new Map<string, string>();
    for (const row of existing) {
      const md = row.metadata as Partial<UserProfileVectorMetadata> | undefined;
      if (md?.user_id && md.source_hash) existingByUser.set(md.user_id, md.source_hash);
    }

    const toEmbed = sourced.filter((s) => existingByUser.get(s.user_id) !== s.hash);

    if (toEmbed.length === 0) {
      if (page.length < PAGE_SIZE) break;
      continue;
    }

    const batchInputs: BatchInputRow[] = toEmbed.map((s) => ({
      custom_id: s.user_id,
      input: s.source,
    }));

    const batchId = await submit(submitOpts, batchInputs);
    const batchResults: BatchResultRow[] = await poll(pollOpts, batchId);

    const vectorByUser = new Map<string, number[]>(
      batchResults.map((r) => [r.custom_id, r.vector]),
    );

    const vectorsToUpsert: number[][] = [];
    const metadataToUpsert: UserProfileVectorMetadata[] = [];
    const idsToUpsert: string[] = [];

    for (const meta of toEmbed) {
      const vec = vectorByUser.get(meta.user_id);
      if (!vec) continue;
      vectorsToUpsert.push(vec);
      metadataToUpsert.push({
        tenant_id,
        user_id: meta.user_id,
        display_name: meta.display_name,
        email: meta.email,
        skills: meta.skills,
        source_hash: meta.hash,
        model_id: modelId,
        embedded_at: embeddedAt,
      });
      idsToUpsert.push(userProfileVectorId(tenant_id, meta.user_id));
    }

    if (vectorsToUpsert.length > 0) {
      await pgVector.upsert({
        indexName: IDENTITY_VECTOR_INDEX,
        vectors: vectorsToUpsert,
        metadata: metadataToUpsert,
        ids: idsToUpsert,
      });
    }

    if (page.length < PAGE_SIZE) break;
  }
}
