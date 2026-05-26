import { PgVector } from '@mastra/pg';
import { resetCoreDb } from '@seta/core/testing';
import {
  createUser,
  IDENTITY_VECTOR_INDEX,
  IDENTITY_VECTOR_NAMESPACE,
  type UserProfileVectorMetadata,
  userProfileVectorId,
} from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { sourceHash } from '@seta/shared-embeddings';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { embedUserProfile } from '../../../src/backend/embeddings/embed-user-profile.ts';

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
      password: 'ChangeMe@2026',
    },
    { type: 'cli', user_id: null },
  );
  return { tenant_id, user_id };
}

async function fetchMeta(
  pgVector: PgVector,
  tenantId: string,
  userId: string,
): Promise<UserProfileVectorMetadata | undefined> {
  try {
    const rows = await pgVector.query({
      indexName: IDENTITY_VECTOR_INDEX,
      filter: { tenant_id: { $eq: tenantId }, user_id: { $eq: userId } },
      topK: 1,
    });
    return rows[0]?.metadata as UserProfileVectorMetadata | undefined;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('does not exist')) return undefined;
    throw err;
  }
}

describe('embedUserProfile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('upserts a single embedding row for a user with skills', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const { tenant_id, user_id } = await seedUser(pool);

      await pool.query(`UPDATE identity.user_profile SET skills = $1 WHERE user_id = $2`, [
        ['typescript', 'postgres'],
        user_id,
      ]);

      await embedUserProfile({ tenant_id, user_id, event_id: 'e1' }, { provider, pgVector });

      const meta = await fetchMeta(pgVector, tenant_id, user_id);
      expect(meta).toBeDefined();
      expect(meta!.source_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(meta!.model_id).toBe(provider.modelId);
      expect(meta!.skills).toEqual(['typescript', 'postgres']);
    });
  });

  it('hash gate: embed is called only once for two identical calls', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const embedSpy = vi.spyOn(provider, 'embed');
      const { tenant_id, user_id } = await seedUser(pool);

      await pool.query(`UPDATE identity.user_profile SET skills = $1 WHERE user_id = $2`, [
        ['go', 'rust'],
        user_id,
      ]);

      const payload = { tenant_id, user_id, event_id: 'e2' };
      const deps = { provider, pgVector };

      await embedUserProfile(payload, deps);
      await embedUserProfile(payload, deps);

      expect(embedSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('deletes the row when user is deactivated', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const { tenant_id, user_id } = await seedUser(pool);

      await pool.query(`UPDATE identity.user_profile SET skills = $1 WHERE user_id = $2`, [
        ['python'],
        user_id,
      ]);

      await embedUserProfile({ tenant_id, user_id, event_id: 'e3' }, { provider, pgVector });
      expect(await fetchMeta(pgVector, tenant_id, user_id)).toBeDefined();

      await pool.query(`UPDATE identity."user" SET deactivated_at = now() WHERE id = $1`, [
        user_id,
      ]);

      await embedUserProfile({ tenant_id, user_id, event_id: 'e3b' }, { provider, pgVector });
      expect(await fetchMeta(pgVector, tenant_id, user_id)).toBeUndefined();
    });
  });

  it('deletes the row when skills are emptied', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const { tenant_id, user_id } = await seedUser(pool);

      await pool.query(`UPDATE identity.user_profile SET skills = $1 WHERE user_id = $2`, [
        ['java'],
        user_id,
      ]);

      await embedUserProfile({ tenant_id, user_id, event_id: 'e4' }, { provider, pgVector });

      await pool.query(`UPDATE identity.user_profile SET skills = '{}' WHERE user_id = $1`, [
        user_id,
      ]);

      await embedUserProfile({ tenant_id, user_id, event_id: 'e4b' }, { provider, pgVector });
      expect(await fetchMeta(pgVector, tenant_id, user_id)).toBeUndefined();
    });
  });

  it('stored source_hash matches expected hash from buildUserProfileSource', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const { tenant_id, user_id } = await seedUser(pool);
      const skills = ['typescript', 'node'];

      await pool.query(`UPDATE identity.user_profile SET skills = $1 WHERE user_id = $2`, [
        skills,
        user_id,
      ]);

      await embedUserProfile({ tenant_id, user_id, event_id: 'e6' }, { provider, pgVector });

      const meta = await fetchMeta(pgVector, tenant_id, user_id);
      const { buildUserProfileSource } = await import('@seta/identity');
      const source = buildUserProfileSource({
        name: 'Test User',
        role: 'team member',
        skills,
      });
      expect(meta!.source_hash).toBe(sourceHash(source));
    });
  });

  it('deterministic vector_id: upsert replaces prior row for same (tenant, user)', async () => {
    await withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const { tenant_id, user_id } = await seedUser(pool);

      await pool.query(`UPDATE identity.user_profile SET skills = $1 WHERE user_id = $2`, [
        ['initial'],
        user_id,
      ]);
      await embedUserProfile({ tenant_id, user_id, event_id: 'e1' }, { provider, pgVector });

      await pool.query(`UPDATE identity.user_profile SET skills = $1 WHERE user_id = $2`, [
        ['revised'],
        user_id,
      ]);
      await embedUserProfile({ tenant_id, user_id, event_id: 'e2' }, { provider, pgVector });

      const all = await pgVector.query({
        indexName: IDENTITY_VECTOR_INDEX,
        filter: { tenant_id: { $eq: tenant_id }, user_id: { $eq: user_id } },
        topK: 10,
      });
      expect(all).toHaveLength(1);
      expect(all[0]!.id).toBe(userProfileVectorId(tenant_id, user_id));
    });
  });
});
