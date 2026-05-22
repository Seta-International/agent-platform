import { resetCoreDb } from '@seta/core/internal/test-support';
import { createUser } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { sourceHash } from '@seta/shared-embeddings';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { embedUserProfile } from '../../src/backend/embeddings/embed-user-profile.ts';

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

async function seedUser(pool: import('pg').Pool): Promise<{ tenant_id: string; user_id: string }> {
  const tenant_id = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
    tenant_id,
    'Test Tenant',
    `t-${tenant_id.slice(0, 8)}`,
  ]);
  const { user_id } = await createUser(
    {
      tenant_id,
      email: `u-${tenant_id.slice(0, 8)}@d.local`,
      name: 'Test User',
      password: 'demo-password-1234',
    },
    { type: 'cli', user_id: null },
  );
  return { tenant_id, user_id };
}

describe('embedUserProfile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('upserts a single embedding row for a user with skills', async () => {
    await withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();
      const { tenant_id, user_id } = await seedUser(pool);

      await pool.query(`UPDATE identity.user_profile SET skills = $1 WHERE user_id = $2`, [
        ['typescript', 'postgres'],
        user_id,
      ]);

      await embedUserProfile({ tenant_id, user_id, event_id: 'e1' }, { pool, provider });

      const rows = await pool.query(
        `SELECT source_hash, model_id FROM identity.user_profile_embeddings
          WHERE tenant_id = $1 AND user_id = $2`,
        [tenant_id, user_id],
      );

      expect(rows.rows).toHaveLength(1);
      const row = rows.rows[0] as { source_hash: string; model_id: string };
      expect(row.source_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.model_id).toBe(provider.modelId);
    });
  });

  it('hash gate: embed is called only once for two identical calls', async () => {
    await withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();
      const embedSpy = vi.spyOn(provider, 'embed');
      const { tenant_id, user_id } = await seedUser(pool);

      await pool.query(`UPDATE identity.user_profile SET skills = $1 WHERE user_id = $2`, [
        ['go', 'rust'],
        user_id,
      ]);

      const payload = { tenant_id, user_id, event_id: 'e2' };
      const deps = { pool, provider };

      await embedUserProfile(payload, deps);
      await embedUserProfile(payload, deps);

      expect(embedSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('deletes the row when user is deactivated', async () => {
    await withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();
      const { tenant_id, user_id } = await seedUser(pool);

      await pool.query(`UPDATE identity.user_profile SET skills = $1 WHERE user_id = $2`, [
        ['python'],
        user_id,
      ]);

      await embedUserProfile({ tenant_id, user_id, event_id: 'e3' }, { pool, provider });

      const before = await pool.query(
        `SELECT COUNT(*)::int AS n FROM identity.user_profile_embeddings
          WHERE tenant_id = $1 AND user_id = $2`,
        [tenant_id, user_id],
      );
      expect((before.rows[0] as { n: number }).n).toBe(1);

      await pool.query(`UPDATE identity."user" SET deactivated_at = now() WHERE id = $1`, [
        user_id,
      ]);

      await embedUserProfile({ tenant_id, user_id, event_id: 'e3b' }, { pool, provider });

      const after = await pool.query(
        `SELECT COUNT(*)::int AS n FROM identity.user_profile_embeddings
          WHERE tenant_id = $1 AND user_id = $2`,
        [tenant_id, user_id],
      );
      expect((after.rows[0] as { n: number }).n).toBe(0);
    });
  });

  it('deletes the row when skills are emptied', async () => {
    await withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();
      const { tenant_id, user_id } = await seedUser(pool);

      await pool.query(`UPDATE identity.user_profile SET skills = $1 WHERE user_id = $2`, [
        ['java'],
        user_id,
      ]);

      await embedUserProfile({ tenant_id, user_id, event_id: 'e4' }, { pool, provider });

      await pool.query(`UPDATE identity.user_profile SET skills = '{}' WHERE user_id = $1`, [
        user_id,
      ]);

      await embedUserProfile({ tenant_id, user_id, event_id: 'e4b' }, { pool, provider });

      const after = await pool.query(
        `SELECT COUNT(*)::int AS n FROM identity.user_profile_embeddings
          WHERE tenant_id = $1 AND user_id = $2`,
        [tenant_id, user_id],
      );
      expect((after.rows[0] as { n: number }).n).toBe(0);
    });
  });

  it('lazy partition: per-tenant partition is created on first embed', async () => {
    await withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();
      const { tenant_id, user_id } = await seedUser(pool);

      await pool.query(`UPDATE identity.user_profile SET skills = $1 WHERE user_id = $2`, [
        ['devops'],
        user_id,
      ]);

      const slug = tenant_id.replaceAll('-', '_');
      const partitionName = `user_profile_embeddings_${slug}`;
      // HNSW index uses the shortened prefix 'upe' to stay under PG's 63-byte limit.
      const hnswIndexName = `upe_${slug}_hnsw_idx`;

      const before = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relname = $1 AND n.nspname = 'identity'
         ) AS exists`,
        [partitionName],
      );
      expect(before.rows[0]?.exists).toBe(false);

      await embedUserProfile({ tenant_id, user_id, event_id: 'e5' }, { pool, provider });

      const after = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relname = $1 AND n.nspname = 'identity'
         ) AS exists`,
        [partitionName],
      );
      expect(after.rows[0]?.exists).toBe(true);

      const hnswAfter = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_indexes
            WHERE schemaname = 'identity' AND indexname = $1
         ) AS exists`,
        [hnswIndexName],
      );
      expect(hnswAfter.rows[0]?.exists).toBe(true);
    });
  });

  it('stored source_hash matches expected hash from buildUserProfileSource', async () => {
    await withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();
      const { tenant_id, user_id } = await seedUser(pool);
      const skills = ['typescript', 'node'];

      await pool.query(`UPDATE identity.user_profile SET skills = $1 WHERE user_id = $2`, [
        skills,
        user_id,
      ]);

      await embedUserProfile({ tenant_id, user_id, event_id: 'e6' }, { pool, provider });

      const rows = await pool.query<{ source_hash: string }>(
        `SELECT source_hash FROM identity.user_profile_embeddings
          WHERE tenant_id = $1 AND user_id = $2`,
        [tenant_id, user_id],
      );

      // Verify the stored hash matches what buildUserProfileSource + sourceHash produces.
      const { buildUserProfileSource } = await import('@seta/identity');
      const source = buildUserProfileSource({ skills });
      expect(rows.rows[0]?.source_hash).toBe(sourceHash(source));
    });
  });
});
