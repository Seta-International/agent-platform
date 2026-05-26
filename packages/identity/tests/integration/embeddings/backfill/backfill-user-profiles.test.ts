import { PgVector } from '@mastra/pg';
import { resetCoreDb } from '@seta/core/testing';
import { IDENTITY_VECTOR_INDEX, IDENTITY_VECTOR_NAMESPACE } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BatchInputRow,
  type BatchResultRow,
  backfillUserProfiles,
} from '../../../../src/backend/embeddings/backfill/backfill-user-profiles.ts';
import { seedUserWithSkillsForTest } from '../../../helpers/seed-user.ts';

function withDb<T>(
  fn: (ctx: { pool: import('pg').Pool; pgVector: PgVector }) => Promise<T>,
): Promise<T> {
  return withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      const pgVector = new PgVector({
        id: 'identity-user-profile-embeddings-test',
        connectionString: databaseUrl,
        schemaName: IDENTITY_VECTOR_NAMESPACE,
      });
      try {
        return await fn({ pool, pgVector });
      } finally {
        await pgVector.disconnect().catch(() => {});
        resetCoreDb();
        await closePools();
      }
    },
  );
}

function makeFakeBatch(dimensions = 1536): {
  submitBatch: (
    opts: { apiKey: string; model: string },
    inputs: BatchInputRow[],
  ) => Promise<string>;
  pollUntilDone: (opts: { apiKey: string }, batchId: string) => Promise<BatchResultRow[]>;
  submittedInputs: BatchInputRow[][];
} {
  const submittedInputs: BatchInputRow[][] = [];
  const pending = new Map<string, BatchInputRow[]>();
  let seq = 0;

  const submitBatch = async (
    _opts: { apiKey: string; model: string },
    inputs: BatchInputRow[],
  ): Promise<string> => {
    const id = `batch-${++seq}`;
    submittedInputs.push(inputs);
    pending.set(id, inputs);
    return id;
  };

  const pollUntilDone = async (
    _opts: { apiKey: string },
    batchId: string,
  ): Promise<BatchResultRow[]> => {
    const inputs = pending.get(batchId) ?? [];
    return inputs.map((row) => ({
      custom_id: row.custom_id,
      vector: new Array<number>(dimensions).fill(1 / Math.sqrt(dimensions)),
    }));
  };

  return { submitBatch, pollUntilDone, submittedInputs };
}

async function listUserIds(pgVector: PgVector, tenantId: string): Promise<string[]> {
  const rows = await pgVector.query({
    indexName: IDENTITY_VECTOR_INDEX,
    filter: { tenant_id: { $eq: tenantId } },
    topK: 1000,
  });
  return rows
    .map((r) => (r.metadata as { user_id?: string } | undefined)?.user_id)
    .filter((id): id is string => typeof id === 'string')
    .sort();
}

describe('backfillUserProfiles', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('embeds active users with non-empty skills', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const { submitBatch, pollUntilDone } = makeFakeBatch(1536);

      const u1 = await seedUserWithSkillsForTest(pool, { skills: ['typescript', 'postgres'] });
      const u2 = await seedUserWithSkillsForTest(pool, {
        tenant_id: u1.tenant_id,
        skills: ['go', 'kubernetes'],
      });

      await backfillUserProfiles({
        tenant_id: u1.tenant_id,
        pool,
        pgVector,
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        submitBatch: submitBatch as never,
        pollUntilDone: pollUntilDone as never,
      });

      const ids = await listUserIds(pgVector, u1.tenant_id);
      expect(ids).toHaveLength(2);
      expect(ids).toContain(u1.user_id);
      expect(ids).toContain(u2.user_id);
    });
  });

  it('skips users with empty skills', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const { submitBatch, pollUntilDone, submittedInputs } = makeFakeBatch(1536);

      const u1 = await seedUserWithSkillsForTest(pool, { skills: ['typescript'] });
      const u2 = await seedUserWithSkillsForTest(pool, {
        tenant_id: u1.tenant_id,
        skills: [],
      });

      await backfillUserProfiles({
        tenant_id: u1.tenant_id,
        pool,
        pgVector,
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        submitBatch: submitBatch as never,
        pollUntilDone: pollUntilDone as never,
      });

      const ids = await listUserIds(pgVector, u1.tenant_id);
      expect(ids).toContain(u1.user_id);
      expect(ids).not.toContain(u2.user_id);

      const allIds = submittedInputs.flat().map((r) => r.custom_id);
      expect(allIds).toContain(u1.user_id);
      expect(allIds).not.toContain(u2.user_id);
    });
  });

  it('skips deactivated users', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const { submitBatch, pollUntilDone, submittedInputs } = makeFakeBatch(1536);

      const u1 = await seedUserWithSkillsForTest(pool, { skills: ['typescript'] });
      const u2 = await seedUserWithSkillsForTest(pool, {
        tenant_id: u1.tenant_id,
        skills: ['go'],
      });

      await pool.query(`UPDATE identity."user" SET deactivated_at = now() WHERE id = $1`, [
        u2.user_id,
      ]);

      await backfillUserProfiles({
        tenant_id: u1.tenant_id,
        pool,
        pgVector,
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        submitBatch: submitBatch as never,
        pollUntilDone: pollUntilDone as never,
      });

      const ids = await listUserIds(pgVector, u1.tenant_id);
      expect(ids).toContain(u1.user_id);
      expect(ids).not.toContain(u2.user_id);

      const allIds = submittedInputs.flat().map((r) => r.custom_id);
      expect(allIds).not.toContain(u2.user_id);
    });
  });

  it('hash gate: second run with no profile changes makes no batch calls', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const { submitBatch, pollUntilDone, submittedInputs } = makeFakeBatch(1536);

      const u1 = await seedUserWithSkillsForTest(pool, { skills: ['typescript'] });

      await backfillUserProfiles({
        tenant_id: u1.tenant_id,
        pool,
        pgVector,
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        submitBatch: submitBatch as never,
        pollUntilDone: pollUntilDone as never,
      });
      expect(submittedInputs).toHaveLength(1);

      const {
        submitBatch: submit2,
        pollUntilDone: poll2,
        submittedInputs: submitted2,
      } = makeFakeBatch(1536);
      await backfillUserProfiles({
        tenant_id: u1.tenant_id,
        pool,
        pgVector,
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        submitBatch: submit2 as never,
        pollUntilDone: poll2 as never,
      });
      expect(submitted2).toHaveLength(0);
    });
  });
});
