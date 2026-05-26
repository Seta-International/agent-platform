import { PgVector } from '@mastra/pg';
import { createContributionRegistry, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { IDENTITY_VECTOR_NAMESPACE } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../../src/backend/domain/create-user.ts';
import { matchUsersToTopic } from '../../../src/backend/domain/match-users-to-topic.ts';
import { updateUserProfile } from '../../../src/backend/domain/update-user-profile.ts';
import { embedUserProfile } from '../../../src/backend/embeddings/embed-user-profile.ts';
import { registerIdentityContributions } from '../../../src/register.ts';

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
      password: 'ChangeMe@2026',
    },
    { type: 'cli', user_id: null },
  );
  return { tenantId, userId };
}

function makePgVector(databaseUrl: string): PgVector {
  return new PgVector({
    id: 'identity-user-profile-embeddings-test',
    connectionString: databaseUrl,
    schemaName: IDENTITY_VECTOR_NAMESPACE,
  });
}

describe('matchUsersToTopic', () => {
  it('returns users whose embedded skills match the topic', () =>
    withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        const { tenantId, userId } = await setup(pool, databaseUrl);
        const provider = new FakeEmbeddingProvider();
        const pgVector = makePgVector(databaseUrl);

        try {
          await updateUserProfile(
            userId,
            { skills: ['terraform', 'kubernetes'] },
            { type: 'user', user_id: userId },
          );

          await embedUserProfile(
            { tenant_id: tenantId, user_id: userId, event_id: 'e1' },
            { provider, pgVector },
          );

          const hits = await matchUsersToTopic(
            {
              topic: 'infrastructure provisioning with terraform',
              tenant_id: tenantId,
              limit: 5,
              minScore: 0,
            },
            { provider, pgVector },
          );

          expect(hits).toHaveLength(1);
          const hit = hits[0]!;
          expect(hit.item.user_id).toBe(userId);
          expect(hit.item.display_name).toBe('Alice');
          expect(hit.rank).toBe(1);
          expect(hit.source).toBe('vector');
        } finally {
          await pgVector.disconnect().catch(() => {});
          resetCoreDb();
          await closePools();
        }
      },
    ));

  it('respects the limit parameter', () =>
    withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        const { tenantId, userId: firstUserId } = await setup(pool, databaseUrl);
        const provider = new FakeEmbeddingProvider();
        const pgVector = makePgVector(databaseUrl);

        try {
          await updateUserProfile(
            firstUserId,
            { skills: ['python', 'django'] },
            { type: 'user', user_id: firstUserId },
          );
          await embedUserProfile(
            { tenant_id: tenantId, user_id: firstUserId, event_id: 'e1' },
            { provider, pgVector },
          );

          const { user_id: secondUserId } = await createUser(
            {
              tenant_id: tenantId,
              email: `u2-${tenantId.slice(0, 8)}@d.local`,
              name: 'Bob',
              password: 'ChangeMe@2026',
            },
            { type: 'cli', user_id: null },
          );
          await updateUserProfile(
            secondUserId,
            { skills: ['python', 'flask'] },
            { type: 'user', user_id: secondUserId },
          );
          await embedUserProfile(
            { tenant_id: tenantId, user_id: secondUserId, event_id: 'e2' },
            { provider, pgVector },
          );

          const hits = await matchUsersToTopic(
            { topic: 'python web development', tenant_id: tenantId, limit: 1, minScore: 0 },
            { provider, pgVector },
          );

          expect(hits.length).toBeLessThanOrEqual(1);
        } finally {
          await pgVector.disconnect().catch(() => {});
          resetCoreDb();
          await closePools();
        }
      },
    ));

  it('returns empty array when no embeddings exist for the tenant', () =>
    withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        const { tenantId } = await setup(pool, databaseUrl);
        const provider = new FakeEmbeddingProvider();
        const pgVector = makePgVector(databaseUrl);

        try {
          const hits = await matchUsersToTopic(
            { topic: 'rust systems programming', tenant_id: tenantId, limit: 5 },
            { provider, pgVector },
          );

          expect(hits).toHaveLength(0);
        } finally {
          await pgVector.disconnect().catch(() => {});
          resetCoreDb();
          await closePools();
        }
      },
    ));

  it('does not return users from other tenants', () =>
    withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        const { tenantId: tenantA, userId: userA } = await setup(pool, databaseUrl);
        const provider = new FakeEmbeddingProvider();
        const pgVector = makePgVector(databaseUrl);

        try {
          await updateUserProfile(
            userA,
            { skills: ['go', 'grpc'] },
            { type: 'user', user_id: userA },
          );
          await embedUserProfile(
            { tenant_id: tenantA, user_id: userA, event_id: 'e1' },
            { provider, pgVector },
          );

          const tenantB = crypto.randomUUID();
          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
            tenantB,
            'Other',
            `t-${tenantB.slice(0, 8)}`,
          ]);

          const hits = await matchUsersToTopic(
            { topic: 'go microservices', tenant_id: tenantB, limit: 5 },
            { provider, pgVector },
          );

          expect(hits).toHaveLength(0);
        } finally {
          await pgVector.disconnect().catch(() => {});
          resetCoreDb();
          await closePools();
        }
      },
    ));

  it('applies minScore filter', () =>
    withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        const { tenantId, userId } = await setup(pool, databaseUrl);
        const provider = new FakeEmbeddingProvider();
        const pgVector = makePgVector(databaseUrl);

        try {
          await updateUserProfile(
            userId,
            { skills: ['java', 'spring'] },
            { type: 'user', user_id: userId },
          );
          await embedUserProfile(
            { tenant_id: tenantId, user_id: userId, event_id: 'e1' },
            { provider, pgVector },
          );

          const hits = await matchUsersToTopic(
            { topic: 'java spring boot', tenant_id: tenantId, limit: 5, minScore: 1.0 },
            { provider, pgVector },
          );

          expect(hits).toHaveLength(0);
        } finally {
          await pgVector.disconnect().catch(() => {});
          resetCoreDb();
          await closePools();
        }
      },
    ));
});
