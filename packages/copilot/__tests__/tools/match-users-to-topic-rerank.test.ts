/**
 * Integration tests for two-stage retrieval (vector + rerank) in match_users_to_topic.
 *
 * Uses NoopReranker so the test is deterministic; verifies that the reranker tag
 * surfaces in the result and that the limit is respected after stage-2 truncation.
 */

import { RequestContext } from '@mastra/core/request-context';
import { createContributionRegistry, runMigrations } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { registerCoreContributions } from '@seta/core/register';
import { closePools, initPools } from '@seta/shared-db';
import { NoopReranker } from '@seta/shared-retrieval';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { embedUserProfile } from '../../src/backend/embeddings/embed-user-profile.ts';
import { matchUsersToTopicTool } from '../../src/backend/tools/match-users-to-topic.ts';
import { seedUserWithSkillsForTest } from '../helpers/seed-user.ts';

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

describe('match_users_to_topic + rerank wiring', () => {
  it('passes hits through the configured reranker and surfaces the reranker tag in the result', () =>
    withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();
      const reranker = new NoopReranker();

      const { tenant_id, user_id } = await seedUserWithSkillsForTest(pool, {
        skills: ['terraform', 'kubernetes'],
      });

      await embedUserProfile(
        { tenant_id, user_id, event_id: 'rerank-user-e1' },
        { pool, provider },
      );

      const tool = matchUsersToTopicTool({
        provider,
        pool,
        reranker,
        sessionProvider: makeSessionProvider(tenant_id),
      });

      const actor = { type: 'user' as const, user_id: 'test-user-id' };
      const result = await tool.execute(
        { topic: 'infrastructure kubernetes', limit: 5, min_score: 0 },
        makeFakeCtx(actor),
      );

      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('error');
      const { candidates, reranker: usedReranker } = result as Awaited<
        ReturnType<ReturnType<typeof tool.execute>>
      >;

      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.user.user_id).toBe(user_id);
      // FakeEmbeddingProvider scores may be slightly negative; verify valid range.
      expect(candidates[0]?.rerank_score).toBeGreaterThanOrEqual(-1);
      expect(usedReranker).toBe('noop');
    }));

  it('respects limit after stage-2 truncation', () =>
    withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();
      const reranker = new NoopReranker();

      const first = await seedUserWithSkillsForTest(pool, { skills: ['python', 'django'] });
      const { tenant_id } = first;

      await embedUserProfile(
        { tenant_id, user_id: first.user_id, event_id: 'rerank-limit-1' },
        { pool, provider },
      );

      for (let i = 2; i <= 4; i++) {
        const { user_id } = await seedUserWithSkillsForTest(pool, {
          tenant_id,
          skills: ['python', 'django'],
        });
        await embedUserProfile(
          { tenant_id, user_id, event_id: `rerank-limit-${i}` },
          { pool, provider },
        );
      }

      const tool = matchUsersToTopicTool({
        provider,
        pool,
        reranker,
        sessionProvider: makeSessionProvider(tenant_id),
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
