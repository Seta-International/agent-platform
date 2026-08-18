import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  cleanActionWorld,
  resetActionWorld,
  seedActionWorld,
} from '../../fixtures/golden/action/world.ts';
import { TENANT_ID } from '../../fixtures/golden/constants.ts';
import { cleanGoldenDataset, seedGoldenDataset } from '../../fixtures/golden/index.ts';
import { preflightGolden } from '../../fixtures/golden/oracles/preflight.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

it('resets task rows without destroying actors, and leaves the A1 tenant intact', async () => {
  await withAgentTestDb(async ({ pool }) => {
    await cleanGoldenDataset(pool);
    await seedGoldenDataset(pool);
    const world = await seedActionWorld(pool);

    // One case's worth of data.
    const taskId = randomUUID();
    await pool.query(
      `INSERT INTO planner.tasks (id, tenant_id, plan_id, bucket_id, title, created_by)
       VALUES ($1, $2, $3, $4, 'Deploy API', $5)`,
      [taskId, world.tenantId, world.planId, world.bucketId, world.adminUserId],
    );
    await pool.query(
      `INSERT INTO planner.task_comments (id, tenant_id, task_id, body, author_id)
       VALUES ($1, $2, $3, 'note', $4)`,
      [randomUUID(), world.tenantId, taskId, world.memberUserId],
    );

    await resetActionWorld(pool, world);

    expect(
      (await pool.query('SELECT 1 FROM planner.tasks WHERE tenant_id = $1', [world.tenantId]))
        .rowCount,
    ).toBe(0);
    expect(
      (
        await pool.query('SELECT 1 FROM planner.task_comments WHERE tenant_id = $1', [
          world.tenantId,
        ])
      ).rowCount,
    ).toBe(0);

    // The expensive half survives: same plan, same members.
    const plans = await pool.query('SELECT id FROM planner.plans WHERE tenant_id = $1', [
      world.tenantId,
    ]);
    expect(plans.rows.map((r) => r.id)).toContain(world.planId);
    const members = await pool.query(
      'SELECT user_id FROM planner.group_members WHERE tenant_id = $1 AND group_id = $2',
      [world.tenantId, world.groupId],
    );
    expect(members.rows.map((r) => r.user_id)).toContain(world.memberUserId);

    // AC2: the A1 tenant is untouched BY CONSTRUCTION, and preflight proves it.
    await expect(preflightGolden(pool, { checkEmbeddings: false })).resolves.toMatchObject({
      ok: true,
    });
    const a1 = await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM planner.tasks WHERE tenant_id = $1',
      [TENANT_ID],
    );
    expect(a1.rows[0]!.n).toBeGreaterThan(0);

    await cleanActionWorld(pool, world);
    await cleanGoldenDataset(pool);
  });
}, 300_000);

it('gives the viewer no task write and the member the full write set', async () => {
  await withAgentTestDb(async ({ pool }) => {
    const world = await seedActionWorld(pool);
    // Resolved from the REAL role assignment, never hardcoded — that is what makes
    // an RBAC refusal in a case a real refusal.
    expect(world.permissions.member.has('planner.task.update')).toBe(true);
    expect(world.permissions.viewer.has('planner.task.update')).toBe(false);
    // The one write a viewer legitimately has (packages/shared-rbac/src/inventory.ts).
    expect(world.permissions.viewer.has('planner.task.comment.create')).toBe(true);
    await cleanActionWorld(pool, world);
  });
}, 300_000);
