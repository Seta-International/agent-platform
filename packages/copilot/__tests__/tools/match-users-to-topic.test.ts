/**
 * Integration tests for the match_users_to_topic Mastra tool.
 *
 * Embeddings are seeded via embedUserProfile (same package, no boundary violation).
 * Session resolution is bypassed via an injected sessionProvider.
 */

import { RequestContext } from '@mastra/core/request-context';
import { createContributionRegistry, runMigrations } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { registerCoreContributions } from '@seta/core/register';
import { createUser, updateUserProfile } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { NoopReranker } from '@seta/shared-retrieval';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { embedUserProfile } from '../../src/backend/embeddings/embed-user-profile.ts';
import { matchUsersToTopicTool } from '../../src/backend/tools/match-users-to-topic.ts';

const withDb = <T>(fn: (ctx: { pool: import('pg').Pool }) => Promise<T>) =>
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
      try {
        return await fn({ pool });
      } finally {
        resetCoreDb();
        await closePools();
      }
    },
  );

function makeFakeCtx(actor: { type: 'user'; user_id: string }) {
  const rc = new RequestContext<{ actor: typeof actor }>();
  rc.set('actor', actor);
  return { requestContext: rc } as unknown as Parameters<
    ReturnType<typeof matchUsersToTopicTool>['execute']
  >[1];
}

function makeSessionProvider(tenantId: string) {
  return async (_actor: { user_id: string }) => ({
    tenant_id: tenantId,
    accessible_group_ids: [] as string[],
  });
}

describe('matchUsersToTopicTool', () => {
  it('returns candidates with user fields, match_score, source', () =>
    withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();

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

      await updateUserProfile(
        userId,
        { skills: ['terraform', 'kubernetes'] },
        { type: 'user', user_id: userId },
      );

      await embedUserProfile(
        { tenant_id: tenantId, user_id: userId, event_id: 'test-e1' },
        { pool, provider },
      );

      const tool = matchUsersToTopicTool({
        provider,
        pool,
        reranker: new NoopReranker(),
        sessionProvider: makeSessionProvider(tenantId),
      });

      const actor = { type: 'user' as const, user_id: 'test-user-id' };
      const result = await tool.execute(
        { topic: 'infrastructure kubernetes', limit: 5, min_score: 0 },
        makeFakeCtx(actor),
      );

      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('error');
      const { candidates } = result as Awaited<ReturnType<ReturnType<typeof tool.execute>>>;
      expect(candidates).toHaveLength(1);
      const c = candidates[0]!;
      expect(c.user.user_id).toBe(userId);
      expect(c.user.display_name).toBe('Alice');
      // FakeEmbeddingProvider uses hash-based vectors, not semantic ones.
      // Cosine similarity may be slightly negative; verify range, not sign.
      expect(c.match_score).toBeGreaterThan(-1);
      expect(c.match_score).toBeLessThanOrEqual(1);
      expect(c.rerank_score).toBeGreaterThanOrEqual(-1);
      expect(c.source).toBe('vector');
    }));

  it('respects limit', () =>
    withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();

      const tenantId = crypto.randomUUID();
      await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
        tenantId,
        'Demo',
        `t-${tenantId.slice(0, 8)}`,
      ]);

      for (let i = 0; i < 3; i++) {
        const { user_id: userId } = await createUser(
          {
            tenant_id: tenantId,
            email: `u${i}-${tenantId.slice(0, 6)}@d.local`,
            name: `User${i}`,
            password: 'ChangeMe@2026',
          },
          { type: 'cli', user_id: null },
        );
        await updateUserProfile(
          userId,
          { skills: ['python', 'django'] },
          { type: 'user', user_id: userId },
        );
        await embedUserProfile(
          { tenant_id: tenantId, user_id: userId, event_id: `test-limit-${i}` },
          { pool, provider },
        );
      }

      const tool = matchUsersToTopicTool({
        provider,
        pool,
        reranker: new NoopReranker(),
        sessionProvider: makeSessionProvider(tenantId),
      });

      const actor = { type: 'user' as const, user_id: 'test-user-id' };
      const result = await tool.execute(
        { topic: 'python web development', limit: 2, min_score: 0 },
        makeFakeCtx(actor),
      );

      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('error');
      const { candidates } = result as Awaited<ReturnType<ReturnType<typeof tool.execute>>>;
      expect(candidates.length).toBeLessThanOrEqual(2);
    }));
});
