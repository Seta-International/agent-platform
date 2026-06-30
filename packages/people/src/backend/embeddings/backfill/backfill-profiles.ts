import type { PgVector } from '@mastra/pg';
import { sourceHash } from '@seta/shared-embeddings';
import type { Pool } from 'pg';
import { listPersonsForBackfill } from '../../domain/list-persons-for-backfill.ts';
import { buildPersonProfileSource } from '../source.ts';
import {
  ensurePeopleVectorIndex,
  PEOPLE_VECTOR_INDEX,
  type PersonProfileVectorMetadata,
  personProfileVectorId,
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

export interface BackfillPersonProfilesOptions {
  tenant_id: string;
  pool: Pool;
  pgVector: PgVector;
  apiKey: string;
  model: 'text-embedding-3-small' | 'text-embedding-3-large';
  submitBatch?: typeof defaultSubmit;
  pollUntilDone?: typeof defaultPoll;
}

export async function backfillPersonProfiles(opts: BackfillPersonProfilesOptions): Promise<void> {
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

  await ensurePeopleVectorIndex(pgVector);

  let cursor = '00000000-0000-0000-0000-000000000000';
  const submitOpts: SubmitOptions = { apiKey, model };
  const pollOpts: OpenAIBatchClient = { apiKey };

  while (true) {
    const page = await listPersonsForBackfill({ tenant_id, cursor, limit: PAGE_SIZE, pool });

    if (page.length === 0) break;

    // biome-ignore lint/style/noNonNullAssertion: page.length > 0 checked above
    cursor = page[page.length - 1]!.person_id;

    const sourced = page.map((row) => {
      const source = buildPersonProfileSource({
        skills: row.skills,
        bio: row.bio ?? undefined,
      });
      return {
        person_id: row.person_id,
        skills: row.skills,
        source,
        hash: sourceHash(source),
      };
    });

    const pageIds = sourced.map((s) => s.person_id);
    const existing = pageIds.length
      ? await pgVector.query({
          indexName: PEOPLE_VECTOR_INDEX,
          filter: { tenant_id: { $eq: tenant_id }, person_id: { $in: pageIds } },
          topK: pageIds.length,
        })
      : [];
    const existingByPerson = new Map<string, string>();
    for (const row of existing) {
      const md = row.metadata as Partial<PersonProfileVectorMetadata> | undefined;
      if (md?.person_id && md.source_hash) existingByPerson.set(md.person_id, md.source_hash);
    }

    const toEmbed = sourced.filter((s) => existingByPerson.get(s.person_id) !== s.hash);

    if (toEmbed.length === 0) {
      if (page.length < PAGE_SIZE) break;
      continue;
    }

    const batchInputs: BatchInputRow[] = toEmbed.map((s) => ({
      custom_id: s.person_id,
      input: s.source,
    }));

    const batchId = await submit(submitOpts, batchInputs);
    const batchResults: BatchResultRow[] = await poll(pollOpts, batchId);

    const vectorByPerson = new Map<string, number[]>(
      batchResults.map((r) => [r.custom_id, r.vector]),
    );

    const vectorsToUpsert: number[][] = [];
    const metadataToUpsert: PersonProfileVectorMetadata[] = [];
    const idsToUpsert: string[] = [];

    for (const meta of toEmbed) {
      const vec = vectorByPerson.get(meta.person_id);
      if (!vec) continue;
      vectorsToUpsert.push(vec);
      metadataToUpsert.push({
        tenant_id,
        person_id: meta.person_id,
        skills: meta.skills,
        source_hash: meta.hash,
        model_id: modelId,
        embedded_at: embeddedAt,
      });
      idsToUpsert.push(personProfileVectorId(tenant_id, meta.person_id));
    }

    if (vectorsToUpsert.length > 0) {
      await pgVector.upsert({
        indexName: PEOPLE_VECTOR_INDEX,
        vectors: vectorsToUpsert,
        metadata: metadataToUpsert,
        ids: idsToUpsert,
      });
    }

    if (page.length < PAGE_SIZE) break;
  }
}
