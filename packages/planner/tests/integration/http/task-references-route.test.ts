import type { SessionEnv, SessionScope } from '@seta/core';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { describe, expect, it } from 'vitest';
import { plannerDb, taskReferences } from '../../../src/backend/db/index.ts';
import { linkTasks } from '../../../src/backend/domain/link-tasks.ts';
import { registerPlannerTasksRoutes } from '../../../src/backend/http/index.ts';
import { createGroup, createPlan, createTask } from '../../../src/index.ts';
import { plannerErrorMapper } from '../../../src/register.ts';
import { seedTenant } from '../../helpers.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

/** The platform wires plannerErrorMapper into the app's onError; do the same
 *  here, otherwise a thrown PlannerError never becomes a status code. */
function buildApp(session: SessionScope) {
  const app = new Hono<SessionEnv>();
  app.use(async (c, next) => {
    c.set('user', session);
    await next();
  });
  registerPlannerTasksRoutes(app);
  app.onError((err, c) => {
    const mapped = plannerErrorMapper(err);
    if (!mapped) throw err;
    return c.json(mapped.body, mapped.status as ContentfulStatusCode);
  });
  return app;
}

async function seedTwoTasks(pool: Parameters<typeof seedTenant>[0]) {
  const seeded = await seedTenant(pool);
  const session = seeded.adminSession;
  const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
  const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });
  const a = await createTask({ plan_id: plan.id, title: 'Alpha', session });
  const b = await createTask({ plan_id: plan.id, title: 'Beta', session });
  return { session, a, b };
}

describe('DELETE /api/planner/v1/task-references/:referenceId', () => {
  it('204s and removes the row', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, a, b } = await seedTwoTasks(pool);
      const link = await linkTasks({
        source_task_id: a.id,
        target_task_id: b.id,
        kind: 'relates',
        session,
      });

      const res = await buildApp(session).request(`/api/planner/v1/task-references/${link.id}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(204);
      expect(await plannerDb().select().from(taskReferences)).toHaveLength(0);
    }));

  it('404s an unknown reference', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session } = await seedTwoTasks(pool);
      const res = await buildApp(session).request(
        '/api/planner/v1/task-references/00000000-0000-4000-8000-000000000000',
        { method: 'DELETE' },
      );
      expect(res.status).toBe(404);
    }));

  // Spec §6.2 test 16: reuse has to actually REACH the client. register.ts's
  // existing 409 rung is load-bearing now, so it is asserted, not assumed.
  it('maps a duplicate link to 409 DUPLICATE_REFERENCE through the registered mapper', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, a, b } = await seedTwoTasks(pool);
      await linkTasks({ source_task_id: a.id, target_task_id: b.id, kind: 'relates', session });
      const err = await linkTasks({
        source_task_id: a.id,
        target_task_id: b.id,
        kind: 'relates',
        session,
      }).catch((e) => e);
      expect(plannerErrorMapper(err)).toMatchObject({
        status: 409,
        body: { error: 'DUPLICATE_REFERENCE' },
      });
    }));
});
