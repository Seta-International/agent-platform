import { randomUUID } from 'node:crypto';
import { createUser } from '@seta/identity';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  makeAvailability,
  makeTaskReader,
  makeTaskSearch,
} from '../../../src/backend/orchestration/adapters.ts';
import { withAgentTestDb } from '../../helpers.ts';

/**
 * Seed a tenant + org.admin actor + one group/plan/bucket/task with labels.
 * org.admin → buildActorSession sees the whole tenant (groupFilter = null), so the
 * adapters can read/search the seeded task by user_id alone.
 */
async function seedAdminTask(
  pool: Pool,
  opts: { labels: string[]; title?: string },
): Promise<{ tenantId: string; adminUserId: string; taskId: string }> {
  const tenantId = randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
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

  // groups.created_by / plans.created_by / tasks.created_by are NOT NULL but unconstrained.
  const actorId = randomUUID();
  const groupId = randomUUID();
  await pool.query(
    `INSERT INTO planner.groups
       (id, tenant_id, name, theme, visibility, default_role, external_source, created_by, deleted_at)
     VALUES ($1, $2, $3, 'blue', 'private', 'member', 'native', $4, NULL)`,
    [groupId, tenantId, `Group ${groupId.slice(0, 8)}`, actorId],
  );
  const planId = randomUUID();
  await pool.query(
    `INSERT INTO planner.plans
       (id, tenant_id, group_id, name, external_source, created_by)
     VALUES ($1, $2, $3, $4, 'native', $5)`,
    [planId, tenantId, groupId, `Plan ${planId.slice(0, 8)}`, actorId],
  );
  const bucketId = randomUUID();
  await pool.query(
    `INSERT INTO planner.buckets
       (id, tenant_id, plan_id, name, external_source)
     VALUES ($1, $2, $3, $4, 'native')`,
    [bucketId, tenantId, planId, `Bucket ${bucketId.slice(0, 8)}`],
  );
  const taskId = randomUUID();
  await pool.query(
    `INSERT INTO planner.tasks
       (id, tenant_id, plan_id, bucket_id, title, description, created_by, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)`,
    [
      taskId,
      tenantId,
      planId,
      bucketId,
      opts.title ?? 'Provision cluster',
      'infra work',
      randomUUID(),
    ],
  );
  // Apply labels: each test run is isolated (fresh tenant), so label names within a
  // plan are unique — no ON CONFLICT needed. plan_id is required by the schema.
  for (const name of opts.labels) {
    const {
      rows: [labelRow],
    } = await pool.query<{ id: string }>(
      `INSERT INTO planner.labels (id, tenant_id, plan_id, name, color)
       VALUES (gen_random_uuid(), $1, $2, $3, 'blue')
       RETURNING id`,
      [tenantId, planId, name],
    );
    await pool.query(
      `INSERT INTO planner.task_labels (task_id, label_id, applied_by)
       VALUES ($1, $2, $3)`,
      [taskId, labelRow!.id, actorId],
    );
  }

  return { tenantId, adminUserId: admin.user_id, taskId };
}

describe('staffing orchestration adapters (real DB)', () => {
  it('makeTaskReader.load surfaces the task labels', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, adminUserId, taskId } = await seedAdminTask(pool, {
        labels: ['infrastructure', 'devops'],
      });
      const ctx = { tenantId, actorUserId: adminUserId };

      const info = await makeTaskReader().load(taskId, ctx);
      expect(info).not.toBeNull();
      expect(info!.taskId).toBe(taskId);
      expect(info!.title).toBe('Provision cluster');
      expect(info!.labels).toEqual(expect.arrayContaining(['infrastructure', 'devops']));
    }));

  it('makeTaskSearch.byLabels filters case-insensitively via the domain function', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, adminUserId, taskId } = await seedAdminTask(pool, {
        labels: ['infrastructure'],
      });
      const ctx = { tenantId, actorUserId: adminUserId };

      // Capitalized query label must still match the lowercase stored label.
      const hits = await makeTaskSearch().byLabels(['Infrastructure'], 20, ctx);
      expect(hits.map((t) => t.taskId)).toEqual([taskId]);
      expect(hits[0]!.status).toBe('not_started');
      expect(hits[0]!.labels).toContain('infrastructure');

      const none = await makeTaskSearch().byLabels(['frontend'], 20, ctx);
      expect(none).toEqual([]);
    }));

  it('makeAvailability.status reads availability_status + display name from identity', () =>
    withAgentTestDb(async ({ pool }) => {
      const tenantId = randomUUID();
      await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
        tenantId,
        `Org ${tenantId.slice(0, 8)}`,
        `org-${tenantId.slice(0, 8)}`,
      ]);
      const u = await createUser(
        {
          tenant_id: tenantId,
          email: `busy-${tenantId.slice(0, 8)}@example.test`,
          name: 'Busy Bee',
          password: 'correct-horse-battery-staple',
          initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
        },
        { type: 'cli', user_id: null },
      );
      // Ensure a profile row exists with a known non-default status.
      await pool.query(
        `INSERT INTO identity.user_profile (user_id, tenant_id, availability_status)
         VALUES ($1, $2, 'busy')
         ON CONFLICT (user_id) DO UPDATE SET availability_status = 'busy'`,
        [u.user_id, tenantId],
      );

      const ctx = { tenantId, actorUserId: u.user_id };
      const s = await makeAvailability().status(u.user_id, ctx);
      expect(s.status).toBe('busy');
      expect(s.name).toBe('Busy Bee');
    }));
});
