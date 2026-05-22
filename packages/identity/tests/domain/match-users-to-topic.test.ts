import { createContributionRegistry, runMigrations } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { registerCoreContributions } from '@seta/core/register';
import { closePools, ensureTenantPartition, initPools } from '@seta/shared-db';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../src/backend/domain/create-user.ts';
import { matchUsersToTopic } from '../../src/backend/domain/match-users-to-topic.ts';
import { updateUserProfile } from '../../src/backend/domain/update-user-profile.ts';
import { registerIdentityContributions } from '../../src/register.ts';

async function setup(
  pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  databaseUrl: string,
) {
  const reg = createContributionRegistry();
  registerCoreContributions(reg);
  registerIdentityContributions(reg);
  await runMigrations(reg, { pool: pool as Parameters<typeof runMigrations>[1]['pool'] });
  initPools({ databaseUrl });
  const tenantId = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
    tenantId,
    'Demo',
    `t-${tenantId.slice(0, 8)}`,
  ]);
  const { user_id: userId } = await createUser(
    {
      tenant_id: tenantId,
      email: `u-${tenantId.slice(0, 8)}@d.local`,
      name: 'Alice',
      password: 'demo-password-1234',
    },
    { type: 'cli', user_id: null },
  );
  return { tenantId, userId };
}

async function seedEmbedding(
  pool: import('pg').Pool,
  opts: { tenantId: string; userId: string; text: string; provider: FakeEmbeddingProvider },
) {
  const slug = opts.tenantId.replaceAll('-', '_');
  await ensureTenantPartition(pool, {
    parent: 'identity.user_profile_embeddings',
    embeddingColumn: 'embedding',
    tenantId: opts.tenantId,
    hnswIndexName: `upe_${slug}_hnsw_idx`,
    opclass: 'halfvec_cosine_ops',
    hnsw: { m: 16, efConstruction: 200 },
  });
  const [vec] = await opts.provider.embed([opts.text]);
  await pool.query(
    `INSERT INTO identity.user_profile_embeddings
       (tenant_id, user_id, source_hash, embedding, model_id, embedded_at)
     VALUES ($1, $2, 'h', $3::halfvec, $4, now())
     ON CONFLICT (tenant_id, user_id) DO UPDATE
       SET embedding = EXCLUDED.embedding, source_hash = EXCLUDED.source_hash`,
    [opts.tenantId, opts.userId, `[${(vec as number[]).join(',')}]`, opts.provider.modelId],
  );
}

describe('matchUsersToTopic', () => {
  it('returns users whose embedded skills match the topic', () =>
    withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        const { tenantId, userId } = await setup(pool, databaseUrl);
        const provider = new FakeEmbeddingProvider();

        try {
          await updateUserProfile(
            userId,
            { skills: ['terraform', 'kubernetes'] },
            { type: 'user', user_id: userId },
          );

          await seedEmbedding(pool, {
            tenantId,
            userId,
            text: 'Skills: terraform, kubernetes',
            provider,
          });

          // minScore: 0 bypasses the threshold so the fake provider's near-zero
          // cosine similarities don't filter out all results.
          const hits = await matchUsersToTopic(
            {
              topic: 'infrastructure provisioning with terraform',
              tenant_id: tenantId,
              limit: 5,
              minScore: 0,
            },
            { provider, pool },
          );

          expect(hits).toHaveLength(1);
          const hit = hits[0]!;
          expect(hit.item.user_id).toBe(userId);
          expect(hit.item.display_name).toBe('Alice');
          expect(hit.score).toBeGreaterThan(0);
          expect(hit.rank).toBe(1);
          expect(hit.source).toBe('vector');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    ));

  it('respects the limit parameter', () =>
    withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        const { tenantId, userId: firstUserId } = await setup(pool, databaseUrl);
        const provider = new FakeEmbeddingProvider();

        try {
          await seedEmbedding(pool, {
            tenantId,
            userId: firstUserId,
            text: 'Skills: python, django',
            provider,
          });

          // Seed a second user in the same tenant.
          const { user_id: secondUserId } = await createUser(
            {
              tenant_id: tenantId,
              email: `u2-${tenantId.slice(0, 8)}@d.local`,
              name: 'Bob',
              password: 'demo-password-1234',
            },
            { type: 'cli', user_id: null },
          );

          await seedEmbedding(pool, {
            tenantId,
            userId: secondUserId,
            text: 'Skills: python, flask',
            provider,
          });

          const hits = await matchUsersToTopic(
            { topic: 'python web development', tenant_id: tenantId, limit: 1, minScore: 0 },
            { provider, pool },
          );

          expect(hits.length).toBeLessThanOrEqual(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    ));

  it('returns empty array when no embeddings exist for the tenant', () =>
    withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        const { tenantId } = await setup(pool, databaseUrl);
        const provider = new FakeEmbeddingProvider();

        try {
          const hits = await matchUsersToTopic(
            { topic: 'rust systems programming', tenant_id: tenantId, limit: 5 },
            { provider, pool },
          );

          expect(hits).toHaveLength(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    ));

  it('does not return users from other tenants', () =>
    withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        const { tenantId: tenantA, userId: userA } = await setup(pool, databaseUrl);
        const provider = new FakeEmbeddingProvider();

        try {
          await seedEmbedding(pool, {
            tenantId: tenantA,
            userId: userA,
            text: 'Skills: go, grpc',
            provider,
          });

          // A completely separate tenant.
          const tenantB = crypto.randomUUID();
          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
            tenantB,
            'Other',
            `t-${tenantB.slice(0, 8)}`,
          ]);

          const hits = await matchUsersToTopic(
            { topic: 'go microservices', tenant_id: tenantB, limit: 5 },
            { provider, pool },
          );

          expect(hits).toHaveLength(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    ));

  it('applies minScore filter', () =>
    withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        const { tenantId, userId } = await setup(pool, databaseUrl);
        const provider = new FakeEmbeddingProvider();

        try {
          await seedEmbedding(pool, {
            tenantId,
            userId,
            text: 'Skills: java, spring',
            provider,
          });

          // minScore 1.0 is the maximum possible cosine similarity; two distinct strings
          // will never reach it with a deterministic fake provider, so zero hits are expected.
          const hits = await matchUsersToTopic(
            { topic: 'java spring boot', tenant_id: tenantId, limit: 5, minScore: 1.0 },
            { provider, pool },
          );

          expect(hits).toHaveLength(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    ));
});
