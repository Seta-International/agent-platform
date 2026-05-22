import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, ensureTenantPartition, initPools } from '@seta/shared-db';
import { sourceHash } from '@seta/shared-embeddings';
import { withTestDb } from '@seta/shared-testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BatchInputRow,
  type BatchResultRow,
  backfillUserProfiles,
} from '../../../src/backend/embeddings/backfill/backfill-user-profiles.ts';
import { seedUserWithSkillsForTest } from '../../helpers/seed-user.ts';

// ---------------------------------------------------------------------------
// Test DB wrapper
// ---------------------------------------------------------------------------
function withDb<T>(fn: (ctx: { pool: import('pg').Pool }) => Promise<T>): Promise<T> {
  return withTestDb(
    {
      templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.SETA_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        return await fn({ pool });
      } finally {
        resetCoreDb();
        await closePools();
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Fake batch helpers
// ---------------------------------------------------------------------------

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
      vector: new Array<number>(dimensions).fill(0),
    }));
  };

  return { submitBatch, pollUntilDone, submittedInputs };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('backfillUserProfiles', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('embeds active users with non-empty skills', async () => {
    await withDb(async ({ pool }) => {
      const { submitBatch, pollUntilDone } = makeFakeBatch(1536);

      const u1 = await seedUserWithSkillsForTest(pool, { skills: ['typescript', 'postgres'] });
      const u2 = await seedUserWithSkillsForTest(pool, {
        tenant_id: u1.tenant_id,
        skills: ['go', 'kubernetes'],
      });

      await backfillUserProfiles({
        tenant_id: u1.tenant_id,
        pool,
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        submitBatch: submitBatch as never,
        pollUntilDone: pollUntilDone as never,
      });

      const rows = await pool.query<{ user_id: string; source_hash: string }>(
        `SELECT user_id, source_hash
           FROM identity.user_profile_embeddings
          WHERE tenant_id = $1
          ORDER BY user_id`,
        [u1.tenant_id],
      );

      expect(rows.rows).toHaveLength(2);
      const userIds = rows.rows.map((r) => r.user_id);
      expect(userIds).toContain(u1.user_id);
      expect(userIds).toContain(u2.user_id);
    });
  });

  it('skips users with empty skills', async () => {
    await withDb(async ({ pool }) => {
      const { submitBatch, pollUntilDone, submittedInputs } = makeFakeBatch(1536);

      // One user with skills, one without.
      const u1 = await seedUserWithSkillsForTest(pool, { skills: ['typescript'] });
      const u2 = await seedUserWithSkillsForTest(pool, {
        tenant_id: u1.tenant_id,
        skills: [],
      });

      await backfillUserProfiles({
        tenant_id: u1.tenant_id,
        pool,
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        submitBatch: submitBatch as never,
        pollUntilDone: pollUntilDone as never,
      });

      const rows = await pool.query<{ user_id: string }>(
        `SELECT user_id FROM identity.user_profile_embeddings WHERE tenant_id = $1`,
        [u1.tenant_id],
      );
      const embeddedIds = rows.rows.map((r) => r.user_id);
      expect(embeddedIds).toContain(u1.user_id);
      expect(embeddedIds).not.toContain(u2.user_id);

      // Only u1's id should have been submitted.
      const allIds = submittedInputs.flat().map((r) => r.custom_id);
      expect(allIds).toContain(u1.user_id);
      expect(allIds).not.toContain(u2.user_id);
    });
  });

  it('skips deactivated users', async () => {
    await withDb(async ({ pool }) => {
      const { submitBatch, pollUntilDone, submittedInputs } = makeFakeBatch(1536);

      const u1 = await seedUserWithSkillsForTest(pool, { skills: ['typescript'] });
      const u2 = await seedUserWithSkillsForTest(pool, {
        tenant_id: u1.tenant_id,
        skills: ['go'],
      });

      // Deactivate u2.
      await pool.query(`UPDATE identity."user" SET deactivated_at = now() WHERE id = $1`, [
        u2.user_id,
      ]);

      await backfillUserProfiles({
        tenant_id: u1.tenant_id,
        pool,
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        submitBatch: submitBatch as never,
        pollUntilDone: pollUntilDone as never,
      });

      const rows = await pool.query<{ user_id: string }>(
        `SELECT user_id FROM identity.user_profile_embeddings WHERE tenant_id = $1`,
        [u1.tenant_id],
      );
      const embeddedIds = rows.rows.map((r) => r.user_id);
      expect(embeddedIds).toContain(u1.user_id);
      expect(embeddedIds).not.toContain(u2.user_id);

      const allIds = submittedInputs.flat().map((r) => r.custom_id);
      expect(allIds).not.toContain(u2.user_id);
    });
  });

  it('hash gate: second run with no profile changes makes no batch calls', async () => {
    await withDb(async ({ pool }) => {
      const { submitBatch, pollUntilDone, submittedInputs } = makeFakeBatch(1536);

      const u1 = await seedUserWithSkillsForTest(pool, { skills: ['typescript'] });

      // First run — should embed.
      await backfillUserProfiles({
        tenant_id: u1.tenant_id,
        pool,
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        submitBatch: submitBatch as never,
        pollUntilDone: pollUntilDone as never,
      });
      expect(submittedInputs).toHaveLength(1);

      // Second run — profile unchanged, hash gate should skip.
      const {
        submitBatch: submit2,
        pollUntilDone: poll2,
        submittedInputs: submitted2,
      } = makeFakeBatch(1536);
      await backfillUserProfiles({
        tenant_id: u1.tenant_id,
        pool,
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        submitBatch: submit2 as never,
        pollUntilDone: poll2 as never,
      });
      expect(submitted2).toHaveLength(0);
    });
  });
});
