import { randomUUID } from 'node:crypto';
import { createUser } from '@seta/identity';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { makeAssign } from '../../../../src/backend/orchestration/assignment/adapters.ts';
import { withAgentTestDb } from '../../agent-tools-helpers.ts';

/**
 * Seed a tenant + org.admin actor + a group the admin belongs to + plan/bucket/task.
 * Membership matters: assignTask runs assertAssigneesAreGroupMembers, so the assignee
 * must be in the task's group for the happy path — and a stranger is how the
 * mid-batch-failure case is provoked.
 */
async function seedAssignableTask(pool: Pool): Promise<{
  tenantId: string;
  adminUserId: string;
  taskId: string;
  groupId: string;
}> {
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
    `INSERT INTO planner.plans
       (id, tenant_id, group_id, name, external_source, created_by)
     VALUES ($1, $2, $3, $4, 'native', $5)`,
    [planId, tenantId, groupId, `Plan ${planId.slice(0, 8)}`, creator],
  );
  const bucketId = randomUUID();
  await pool.query(
    `INSERT INTO planner.buckets
       (id, tenant_id, plan_id, name, external_source, created_by)
     VALUES ($1, $2, $3, $4, 'native', $5)`,
    [bucketId, tenantId, planId, `Bucket ${bucketId.slice(0, 8)}`, creator],
  );
  const taskId = randomUUID();
  await pool.query(
    `INSERT INTO planner.tasks
       (id, tenant_id, plan_id, bucket_id, title, description, created_by, deleted_at)
     VALUES ($1, $2, $3, $4, 'Ship it', 'infra work', $5, NULL)`,
    [taskId, tenantId, planId, bucketId, creator],
  );

  return { tenantId, adminUserId: admin.user_id, taskId, groupId };
}

async function assignedCount(pool: Pool, taskId: string): Promise<number> {
  const r = await pool.query(
    'SELECT count(*)::int AS n FROM planner.task_assignments WHERE task_id = $1',
    [taskId],
  );
  return r.rows[0].n as number;
}

interface AuditRow {
  actor: Record<string, unknown> | null;
  before: unknown;
  after: unknown;
}

/** Reads the audit row straight from the outbox. Deliberately raw SQL rather than
 *  @seta/core/backend's queryAudit(): dependency-cruiser's only-server-imports-backend
 *  rule forbids a module test from importing another module's backend entrypoint. */
async function assignedEvents(pool: Pool, tenantId: string): Promise<AuditRow[]> {
  const r = await pool.query<AuditRow>(
    `SELECT actor, before, after FROM core.events
      WHERE tenant_id = $1 AND event_type = 'planner.task.assigned'
      ORDER BY occurred_at`,
    [tenantId],
  );
  return r.rows;
}

async function keyRowCount(pool: Pool, tenantId: string, key: string): Promise<number> {
  const r = await pool.query(
    'SELECT count(*)::int AS n FROM core.mutation_idempotency WHERE tenant_id = $1 AND key = $2',
    [tenantId, key],
  );
  return r.rows[0].n as number;
}

describe('gated assign (FUT-803 retrofit)', () => {
  it('the same idempotency key twice writes the assignee once and emits one assigned event', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, adminUserId, taskId } = await seedAssignableTask(pool);
      const args = {
        taskId,
        assigneeUserIds: [adminUserId],
        tenantId,
        actorUserId: adminUserId,
        idempotencyKey: randomUUID(),
      };

      await makeAssign().assign(args);
      await makeAssign().assign(args);

      expect(await assignedCount(pool, taskId)).toBe(1);
      expect(await assignedEvents(pool, tenantId)).toHaveLength(1);
    }));

  it('the assign event is attributed to the agent on behalf of the confirming user, with a real diff', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, adminUserId, taskId } = await seedAssignableTask(pool);
      await makeAssign().assign({
        taskId,
        assigneeUserIds: [adminUserId],
        tenantId,
        actorUserId: adminUserId,
        idempotencyKey: randomUUID(),
      });

      const rows = await assignedEvents(pool, tenantId);
      expect(rows[0]?.actor).toMatchObject({
        actor_kind: 'agent',
        on_behalf_of: adminUserId,
      });
      expect(rows[0]?.before).toEqual({ assigneeUserIds: [] });
      expect(rows[0]?.after).toEqual({ assigneeUserIds: [adminUserId] });
    }));

  it('a failing assignee in the batch leaves the whole batch unwritten and no key row', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, adminUserId, taskId } = await seedAssignableTask(pool);
      const key = randomUUID();
      const stranger = randomUUID(); // not a group member ⇒ assignTask throws

      await expect(
        makeAssign().assign({
          taskId,
          assigneeUserIds: [adminUserId, stranger],
          tenantId,
          actorUserId: adminUserId,
          idempotencyKey: key,
        }),
      ).rejects.toThrow();

      expect(await assignedCount(pool, taskId)).toBe(0);
      expect(await keyRowCount(pool, tenantId, key)).toBe(0);
    }));

  it('the original PlannerError survives the gateway with its task_id details intact', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, adminUserId } = await seedAssignableTask(pool);
      const missingTaskId = randomUUID();

      await expect(
        makeAssign().assign({
          taskId: missingTaskId,
          assigneeUserIds: [adminUserId],
          tenantId,
          actorUserId: adminUserId,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', details: { task_id: missingTaskId } });
    }));
});
