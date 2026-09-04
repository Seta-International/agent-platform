import { randomUUID } from 'node:crypto';
import { createUser } from '@seta/identity';
import type { Pool } from 'pg';

export interface SeededTasks {
  tenantId: string;
  actorUserId: string;
  groupId: string;
  tasks: Array<{ taskId: string; version: number }>;
}

/**
 * Seed tenant + org.admin actor + a group the admin belongs to + plan/bucket +
 * N tasks in ONE plan. Group membership matters: the update and link ports gate
 * per group, and getTaskGroupId resolves the group via the plan.
 *
 * Lives in its own module rather than inside a `.test.ts`: biome's
 * `noExportsInTest` forbids exporting from a spec file, and both the update and
 * the link suites need the same seed.
 */
export async function seedTasksFixture(
  pool: Pool,
  opts: { titles: string[]; due_at?: string | null },
): Promise<SeededTasks> {
  const tenantId = randomUUID();
  await pool.query('INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)', [
    tenantId,
    `Org ${tenantId.slice(0, 8)}`,
    `org-${tenantId.slice(0, 8)}`,
  ]);

  const admin = await createUser(
    {
      tenant_id: tenantId,
      email: `admin-${tenantId.slice(0, 8)}@example.test`,
      name: 'Admin',
      password: 'correct-horse-battery-staple',
      initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
    },
    { type: 'cli', user_id: null },
  );

  const creator = randomUUID();
  const groupId = randomUUID();
  await pool.query(
    `INSERT INTO planner.groups
       (id, tenant_id, name, theme, visibility, default_role, external_source, created_by, deleted_at)
     VALUES ($1, $2, $3, 'blue', 'private', 'member', 'native', $4, NULL)`,
    [groupId, tenantId, `Group ${groupId.slice(0, 8)}`, creator],
  );
  await pool.query(
    `INSERT INTO planner.group_members (tenant_id, group_id, user_id, role, added_by)
     VALUES ($1, $2, $3, 'member', $4)`,
    [tenantId, groupId, admin.user_id, creator],
  );
  const planId = randomUUID();
  await pool.query(
    `INSERT INTO planner.plans (id, tenant_id, group_id, name, external_source, created_by)
     VALUES ($1, $2, $3, $4, 'native', $5)`,
    [planId, tenantId, groupId, `Plan ${planId.slice(0, 8)}`, creator],
  );
  const bucketId = randomUUID();
  await pool.query(
    `INSERT INTO planner.buckets (id, tenant_id, plan_id, name, external_source, created_by)
     VALUES ($1, $2, $3, $4, 'native', $5)`,
    [bucketId, tenantId, planId, `Bucket ${bucketId.slice(0, 8)}`, creator],
  );

  const tasks: Array<{ taskId: string; version: number }> = [];
  for (const title of opts.titles) {
    const taskId = randomUUID();
    const inserted = await pool.query<{ version: number }>(
      `INSERT INTO planner.tasks
         (id, tenant_id, plan_id, bucket_id, title, due_at, created_by, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
       RETURNING version`,
      [taskId, tenantId, planId, bucketId, title, opts.due_at ?? null, creator],
    );
    tasks.push({ taskId, version: inserted.rows[0]?.version as number });
  }

  return { tenantId, actorUserId: admin.user_id, groupId, tasks };
}
