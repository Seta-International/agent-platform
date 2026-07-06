import { PgVector } from '@mastra/pg';
import { AgentRegistry, type CrossModuleReadToolSpec } from '@seta/agent-sdk';
import type { SessionEnv } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { NoopReranker } from '@seta/shared-retrieval';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// The exact-overlap branch delegates to People's people_searchUsersBySkillExact
// tool, which is only registered when the People module is imported. This
// planner-only harness never imports it, so register a fake that matches the
// admin on the task's label — otherwise the pool is empty by construction.
function registerFakeSkillExactTool(
  hits: ReadonlyArray<{ userId: string; matchedSkills: string[]; overlap: number }>,
): void {
  const spec: CrossModuleReadToolSpec<
    { labels: string[] },
    { hits: Array<{ userId: string; matchedSkills: string[]; overlap: number }> }
  > = {
    id: 'people_searchUsersBySkillExact',
    description: 'fake',
    inputSchema: z.object({ labels: z.array(z.string()) }),
    outputSchema: z.object({
      hits: z.array(
        z.object({ userId: z.string(), matchedSkills: z.array(z.string()), overlap: z.number() }),
      ),
    }),
    rbac: 'identity.user.read',
    availableTo: 'all-specialists',
    execute: async () => ({ hits: [...hits] }),
  };
  AgentRegistry.registerCrossModuleReadTool(spec);
}

import { registerPlannerTasksRoutes } from '../../src/backend/http/index.ts';
import * as assignBySkillDeps from '../../src/backend/workflows/assign-by-skill/deps.ts';
import { createGroup, createPlan, createTask, PLANNER_VECTOR_NAMESPACE } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';
import { applyLabels } from './label-test-helpers.ts';

function testDbOpts() {
  return {
    templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
    baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
  };
}

describe('GET /api/planner/v1/tasks/:id/assignee-suggestions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 with an array of ranked group members', async () => {
    await withTestDb(testDbOpts(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });

      const pgVector = new PgVector({
        id: 'assignee-suggestions-route-test',
        connectionString: databaseUrl,
        schemaName: PLANNER_VECTOR_NAMESPACE,
      });

      // The route calls suggestTaskAssignees with no explicit deps, so it
      // falls back to defaultAssignBySkillDeps(), which resolves a live
      // OpenAI-backed embedding provider + LLM-judge reranker from
      // process.env. Neither is available here: this DB-only harness has no
      // OPENAI_API_KEY, and DATABASE_URL is never set on process.env (each
      // test gets its own isolated URL from testcontainers via
      // initPools({ databaseUrl })). Swap in the same Fake/Noop doubles
      // Task 2's domain test (suggest-task-assignees.test.ts) uses for the
      // identical dependency, so the ranking pipeline runs deterministically
      // against the real test Postgres without a live LLM call.
      vi.spyOn(assignBySkillDeps, 'defaultAssignBySkillDeps').mockReturnValue({
        provider: new FakeEmbeddingProvider(),
        pgVector,
        reranker: new NoopReranker(),
      });

      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;

        const app = new Hono<SessionEnv>();
        app.use(async (c, next) => {
          c.set('user', session);
          await next();
        });
        registerPlannerTasksRoutes(app);

        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });
        const task = await createTask({
          plan_id: plan.id,
          title: 'Fix login',
          description: 'OAuth flow broken',
          session,
        });
        await applyLabels(pool, {
          tenant_id: seeded.tenant_id,
          plan_id: plan.id,
          task_id: task.id,
          applied_by: seeded.admin.user_id,
          names: ['react'],
        });

        // The group creator (admin) is auto-added as owner by createGroup;
        // register an exact-overlap hit for them so the pool has a candidate.
        AgentRegistry.__resetForTests();
        registerFakeSkillExactTool([
          { userId: seeded.admin.user_id, matchedSkills: ['react'], overlap: 1 },
        ]);

        const res = await app.request(`/api/planner/v1/tasks/${task.id}/assignee-suggestions`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as Array<{ user_id: string; score: number }>;
        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBeGreaterThan(0);
        expect(body[0]).toHaveProperty('user_id');
        expect(body[0]).toHaveProperty('score');
      } finally {
        AgentRegistry.__resetForTests();
        await pgVector.disconnect().catch(() => {});
        resetCoreDb();
        await closePools();
      }
    });
  });
});
