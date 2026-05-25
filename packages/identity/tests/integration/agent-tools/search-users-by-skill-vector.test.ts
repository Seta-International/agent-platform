import { PgVector } from '@mastra/pg';
import { createContributionRegistry, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { createUser, IDENTITY_VECTOR_NAMESPACE, updateUserProfile } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { buildSearchUsersBySkillVectorSpec } from '../../../src/backend/agent-tools/search-users-by-skill-vector.ts';
import { embedUserProfile } from '../../../src/backend/embeddings/embed-user-profile.ts';

const withDb = <T>(fn: (ctx: { pool: import('pg').Pool; pgVector: PgVector }) => Promise<T>) =>
  withTestDb(
    {
      templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.SETA_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      const reg = createContributionRegistry();
      registerCoreContributions(reg);
      const { registerIdentityContributions } = await import('@seta/identity/register');
      registerIdentityContributions(reg);
      await runMigrations(reg, { pool: pool as Parameters<typeof runMigrations>[1]['pool'] });
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

async function seedUserWithSkills(
  _pool: import('pg').Pool,
  pgVector: PgVector,
  provider: FakeEmbeddingProvider,
  opts: { tenantId: string; name: string; emailSlug: string; skills: string[]; eventId: string },
): Promise<string> {
  const { user_id } = await createUser(
    {
      tenant_id: opts.tenantId,
      email: `${opts.emailSlug}@d.local`,
      name: opts.name,
      password: 'ChangeMe@2026',
    },
    { type: 'cli', user_id: null },
  );
  await updateUserProfile(user_id, { skills: opts.skills }, { type: 'user', user_id });
  await embedUserProfile(
    { tenant_id: opts.tenantId, user_id, event_id: opts.eventId },
    { provider, pgVector },
  );
  return user_id;
}

describe('identity_searchUsersBySkillVector cross-module read tool', () => {
  it('returns userId + score for embedded users in the tenant', () =>
    withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const tenantId = crypto.randomUUID();
      await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
        tenantId,
        'Demo',
        `t-${tenantId.slice(0, 8)}`,
      ]);

      const userId = await seedUserWithSkills(pool, pgVector, provider, {
        tenantId,
        name: 'Alice',
        emailSlug: `alice-${tenantId.slice(0, 6)}`,
        skills: ['react', 'typescript', 'auth'],
        eventId: 'evt-alice',
      });

      const spec = buildSearchUsersBySkillVectorSpec({ provider, pgVector });
      const out = await spec.execute({
        session: { tenant_id: tenantId, user_id: userId },
        input: { queryText: 'frontend developer with OAuth experience', topK: 5, minScore: 0 },
      });

      expect(out.hits.length).toBeGreaterThan(0);
      expect(out.hits[0]!.userId).toBe(userId);
      expect(out.hits[0]!.score).toBeGreaterThanOrEqual(-1);
      expect(out.hits[0]!.score).toBeLessThanOrEqual(1);
    }));

  it('is tenant-scoped: does not surface users from another tenant', () =>
    withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const tenantA = crypto.randomUUID();
      const tenantB = crypto.randomUUID();
      for (const t of [tenantA, tenantB]) {
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
          t,
          'Demo',
          `t-${t.slice(0, 8)}`,
        ]);
      }

      await seedUserWithSkills(pool, pgVector, provider, {
        tenantId: tenantA,
        name: 'AliceA',
        emailSlug: `a-${tenantA.slice(0, 6)}`,
        skills: ['rust'],
        eventId: 'evt-a',
      });

      const spec = buildSearchUsersBySkillVectorSpec({ provider, pgVector });
      const out = await spec.execute({
        session: { tenant_id: tenantB, user_id: crypto.randomUUID() },
        input: { queryText: 'rust systems', topK: 5 },
      });

      expect(out.hits).toHaveLength(0);
    }));

  it('honors topK limit', () =>
    withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const tenantId = crypto.randomUUID();
      await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
        tenantId,
        'Demo',
        `t-${tenantId.slice(0, 8)}`,
      ]);

      for (let i = 0; i < 3; i++) {
        await seedUserWithSkills(pool, pgVector, provider, {
          tenantId,
          name: `U${i}`,
          emailSlug: `u${i}-${tenantId.slice(0, 6)}`,
          skills: ['python', 'django'],
          eventId: `evt-${i}`,
        });
      }

      const spec = buildSearchUsersBySkillVectorSpec({ provider, pgVector });
      const out = await spec.execute({
        session: { tenant_id: tenantId, user_id: crypto.randomUUID() },
        input: { queryText: 'python web', topK: 2, minScore: 0 },
      });

      expect(out.hits.length).toBeLessThanOrEqual(2);
    }));
});
