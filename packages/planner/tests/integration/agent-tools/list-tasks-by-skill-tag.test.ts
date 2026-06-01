import { RequestContext } from '@mastra/core/request-context';
import { resetCoreDb } from '@seta/core/testing';
import { plannerListTasksBySkillTagTool } from '@seta/planner/agent-tools';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { createGroup, createPlan, createTask, updateTask } from '../../../src/index.ts';
import { seedTenant } from '../../helpers.ts';

const withDb = <T>(fn: (ctx: { pool: Pool; databaseUrl: string }) => Promise<T>) =>
  withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
    },
    fn,
  );

function makeFakeCtx(actor: { type: 'user'; user_id: string }, tenantId: string) {
  const rc = new RequestContext<{ actor: typeof actor; tenant_id: string }>();
  rc.set('actor', actor);
  rc.set('tenant_id', tenantId);
  return { requestContext: rc } as unknown as Parameters<
    NonNullable<ReturnType<typeof plannerListTasksBySkillTagTool>['execute']>
  >[1];
}

describe('plannerListTasksBySkillTagTool', () => {
  it('returns only not_started infra tasks when status=not_started', () =>
    withDb(async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
        const todo = await createTask({
          plan_id: plan.id,
          title: 'Provision cluster',
          skill_tags: ['infrastructure'],
          session,
        });
        const done = await createTask({
          plan_id: plan.id,
          title: 'Old infra',
          skill_tags: ['infrastructure'],
          session,
        });
        await updateTask({
          task_id: done.id,
          expected_version: done.version,
          patch: { percent_complete: 100 },
          session,
        });

        const tool = plannerListTasksBySkillTagTool({ sessionProvider: async () => session });
        const result = (await tool.execute!(
          { tags: ['infrastructure'], status: 'not_started', limit: 10 },
          makeFakeCtx({ type: 'user', user_id: 'tester' }, seeded.tenant_id),
        )) as {
          results: Array<{ taskId: string; title: string; status: string; groupId: string }>;
        };

        expect(result.results.map((r) => r.taskId)).toEqual([todo.id]);
        expect(result.results[0]!.status).toBe('not_started');
        expect(result.results[0]!.groupId).toBe(group.id);
      } finally {
        resetCoreDb();
        await closePools();
      }
    }));

  it('returns empty results for an unknown tag', () =>
    withDb(async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
        await createTask({
          plan_id: plan.id,
          title: 'Provision cluster',
          skill_tags: ['infrastructure'],
          session,
        });

        const tool = plannerListTasksBySkillTagTool({ sessionProvider: async () => session });
        const result = (await tool.execute!(
          { tags: ['nonexistent-tag'], status: 'any', limit: 10 },
          makeFakeCtx({ type: 'user', user_id: 'tester' }, seeded.tenant_id),
        )) as { results: unknown[] };

        expect(result.results).toHaveLength(0);
      } finally {
        resetCoreDb();
        await closePools();
      }
    }));
});
