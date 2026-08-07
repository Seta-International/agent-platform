import type { SessionEnv, SessionScope } from '@seta/core';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { describe, expect, it } from 'vitest';
import { plannerDb, taskLinks } from '../../../src/backend/db/index.ts';
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

async function seedTwoLinkedTasks(pool: Parameters<typeof seedTenant>[0]) {
  const seeded = await seedTenant(pool);
  const session = seeded.adminSession;
  const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
  const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });
  const a = await createTask({ plan_id: plan.id, title: 'Alpha', session });
  const b = await createTask({ plan_id: plan.id, title: 'Beta', session });
  return { session, a, b };
}

describe('DELETE /api/planner/v1/task-links/:linkId', () => {
  it('204s and removes the row', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, a, b } = await seedTwoLinkedTasks(pool);
      const link = await linkTasks({
        source_task_id: a.id,
        target_task_id: b.id,
        kind: 'relates',
        session,
      });

      const res = await buildApp(session).request(`/api/planner/v1/task-links/${link.id}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(204);
      expect(await plannerDb().select().from(taskLinks)).toHaveLength(0);
    }));

  it('404s an unknown link', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session } = await seedTwoLinkedTasks(pool);
      const res = await buildApp(session).request(
        '/api/planner/v1/task-links/00000000-0000-4000-8000-000000000000',
        { method: 'DELETE' },
      );
      expect(res.status).toBe(404);
    }));

  // The new code is WIRED, not merely added to the union: it must arrive as a
  // 409 with `error: 'DUPLICATE_LINK'` — the shape TaskDetailReferencesCard
  // already knows how to phrase.
  it('maps a duplicate link to 409 DUPLICATE_LINK through the registered mapper', () =>
    withAgentTestDb(async ({ pool }) => {
      const { session, a, b } = await seedTwoLinkedTasks(pool);
      await linkTasks({ source_task_id: a.id, target_task_id: b.id, kind: 'relates', session });
      const err = await linkTasks({
        source_task_id: a.id,
        target_task_id: b.id,
        kind: 'relates',
        session,
      }).catch((e) => e);
      expect(plannerErrorMapper(err)).toMatchObject({
        status: 409,
        body: { error: 'DUPLICATE_LINK' },
      });
    }));
});
